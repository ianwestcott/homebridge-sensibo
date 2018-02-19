const REFRESH_THRESHOLD = 2000

// 3.0V (logical full capacity)
const BATTERY_MAX_VOLTAGE = 3000
// 2.6V (estimated)
const BATTERY_MIN_VOLTAGE = 2600

const TEMPERATURE_UNIT_CELSIUS = 'C'
const TEMPERATURE_UNIT_FAHRENHEIT = 'F'

const MODE_COOL = 'cool'
const MODE_DRY = 'dry'
const MODE_HEAT = 'heat'
const MODE_FAN = 'fan'
const MODE_AUTO = 'auto'

const FAN_LEVEL_HIGH = 'high'
const FAN_LEVEL_MEDIUM = 'medium'
const FAN_LEVEL_LOW = 'low'
const FAN_LEVEL_AUTO = 'auto'

const SWING_STOPPED = 'stopped'
const SWING_LOW = 'fixedBottom'
const SWING_MIDDLE = 'fixedMiddle'
const SWING_HIGH = 'fixedTop'
const SWING_MOVING = 'rangeFull'

const PROPERTY_ON = 'on'
const PROPERTY_MODE = 'mode'
const PROPERTY_FAN_LEVEL = 'fanLevel'
const PROPERTY_TARGET_TEMPERATURE = 'targetTemperature'
const PROPERTY_TEMPERATURE_UNIT = 'temperatureUnit'
const PROPERTY_NATIVE_TARGET_TEMPERATURE = 'nativeTargetTemperature'
const PROPERTY_NATIVE_TEMPERATURE_UNIT = 'nativeTemperatureUnit'
const PROPERTY_SWING = 'swing'

function toCelsius (temperature) {
  return Math.round((temperature - 32) * 5 / 9);
}

function toFahrenheit (temperature) {
  return Math.round(Math.floor(temperature) * 9 / 5 + 32);
}

module.exports = function (Accessory, Service, Characteristic, uuid) {
  class SensiboPodAccessory extends Accessory {
    constructor (platform, device) {
      super(device.room.name, uuid.generate(`hbdev:sensibo:pod:${device.id}`))
      this.device = device
      this.name = device.room.name.replace(/[^\d\w\s']/, " ")
      this.platform = platform
      this.log = platform.log
      this.debug = platform.debug
      this.deviceGroup = 'pods'
      this.capabilities = {}
      this.state = {}
      this.sensor = {}

      this.temperatureUnit = platform.config.temperatureUnit.toUpperCase() === TEMPERATURE_UNIT_CELSIUS
        ? TEMPERATURE_UNIT_CELSIUS
        : platform.config.temperatureUnit.toUpperCase() === TEMPERATURE_UNIT_FAHRENHEIT
        ? TEMPERATURE_UNIT_FAHRENHEIT
        : null

      const informationService = this.getService(Service.AccessoryInformation)
      informationService.setCharacteristic(
        Characteristic.Manufacturer,
        'homebridge-sensibo'
      )
      informationService.setCharacteristic(Characteristic.Model, '0.3.0')
      informationService.setCharacteristic(
        Characteristic.SerialNumber,
        this.device.id
      )
      this.coolingThresholdTemperature = 24

      this.refreshCapabilities()
      this.handleAll()
      this.loadData()
    }

    handleAll () {
      // TODO remove this and handle individual objects in constructor?
      this.handleHumiditySensor()
      this.handleTemperatureSensor()
      this.handleDehumidifier()
      this.handleHeatSwitch()
      this.handleACSwitch()
      this.handleFan()
      this.handleSwing()
      this.handleThermostat()
    }

    handleHumiditySensor () {
      this
        .addService(Service.HumiditySensor, `${this.name} Humidity`)
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', callback => callback(null, Math.round(this.sensor.humidity)))
    }

    handleTemperatureSensor () {
      const temperatureSensor = this.addService(Service.TemperatureSensor, `${this.name} Temperature`)
      temperatureSensor.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', callback => callback(null, this.sensor.temperature.toFixed(1)))
      temperatureSensor.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', callback => {
          const batteryStatus = this.sensor.batteryVoltage > BATTERY_MIN_VOLTAGE
            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
            : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          callback(null, batteryStatus)
        })

    }

    handleDehumidifier () {
      const Dehumidifier = this.addService(Service.HumidifierDehumidifier, `${this.name} Dehumidifier`)
      Dehumidifier.setCharacteristic(Characteristic.TargetHumidifierDehumidifierState,
        Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER)
      Dehumidifier.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', callback => callback(null, Math.round(this.sensor.humidity)))
      Dehumidifier.getCharacteristic(Characteristic.Active)
        .on('get', callback => {
          const active = (this.state.on && this.state[PROPERTY_MODE] === MODE_DRY)
            ? Characteristic.Active.ACTIVE
            : Characteristic.Active.INACTIVE
          callback(null, active)
        })
        .on('set', (value, callback) => {
          const active = value === Characteristic.Active.ACTIVE
            ? true
            : false
          this.state.on = active
          this.state[PROPERTY_MODE] = MODE_DRY
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        })
      Dehumidifier.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
        .on('get', callback => {
          const state = (this.state.on && this.state[PROPERTY_MODE] === MODE_DRY)
            ? Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING
            : Characteristic.CurrentHumidifierDehumidifierState.INACTIVE
          callback(null, state)
        })
    }

    handleHeatSwitch () {
      this
        .addService(Service.Switch, `${this.name} Heat`, uuid.generate(`hbdev:sensibo:pod:${this.device.id}:heatswitch`))
          .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, this.state.on && this.state.mode === MODE_HEAT))
            .on('set', (value, callback) => {
              this.state.on = Boolean(value)
              if (this.state.on) this.state.mode = MODE_HEAT
              this.platform.api.submitState(this.device.id, this.state)
                .then(() => {
                  this.forceRefresh()
                  callback()
                })
                .catch(error => {
                  this.log.error(error)
                  callback(error)
                })
            })
    }

    handleACSwitch () {
      this
        .addService(Service.Switch, `${this.name} AC`, uuid.generate(`hbdev:sensibo:pod:${this.device.id}:acswitch`))
          .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, this.state.on && this.state.mode === MODE_COOL))
            .on('set', (value, callback) => {
              this.state.on = Boolean(value)
              if (this.state.on) this.state.mode = MODE_COOL
              this.platform.api.submitState(this.device.id, this.state)
                .then(() => {
                  this.forceRefresh()
                  callback()
                })
                .catch(error => {
                  this.log.error(error)
                  callback(error)
                })
            })
    }

    handleFan () {
      const Fan = this.addService(Service.Fanv2, `${this.name} Fan`)
      Fan.getCharacteristic(Characteristic.Active)
        .on('get', callback => {
          const active = this.state.on
            ? Characteristic.Active.ACTIVE
            : Characteristic.Active.INACTIVE
          callback(null, active)
        })
        /* .on('set', (value, callback) => {
          const active = value === Characteristic.Active.ACTIVE
            ? true
            : false
          this.state.on = active
          this.state[PROPERTY_MODE] = MODE_FAN
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        }) */
      Fan.getCharacteristic(Characteristic.RotationSpeed)
        .on('get', callback => {
          var fanLevelValue = 0
          if (this.state[PROPERTY_FAN_LEVEL] === FAN_LEVEL_LOW) fanLevelValue = 30
          if (this.state[PROPERTY_FAN_LEVEL] === FAN_LEVEL_MEDIUM) fanLevelValue = 60
          if (this.state[PROPERTY_FAN_LEVEL] === FAN_LEVEL_HIGH) fanLevelValue = 100
          callback(null, fanLevelValue)
        })
        .on('set', (value, callback) => {
          if (!this.state.on) {
            this.state.on = true
            this.state[PROPERTY_MODE] = MODE_FAN
          }
          if (value === 0) this.state.on = false
          if (value > 0 && value <= 40) this.state[PROPERTY_FAN_LEVEL] = FAN_LEVEL_LOW
          if (value > 35 && value <= 70) this.state[PROPERTY_FAN_LEVEL] = FAN_LEVEL_MEDIUM
          if (value > 65) this.state[PROPERTY_FAN_LEVEL] = FAN_LEVEL_HIGH
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        })
      Fan.getCharacteristic(Characteristic.TargetFanState)
        .on('get', callback => {
          const fanState = this.state[PROPERTY_FAN_LEVEL] === FAN_LEVEL_AUTO
            ? Characteristic.TargetFanState.AUTO
            : Characteristic.TargetFanState.MANUAL
          callback(null, fanState)
        })
        .on('set', (value, callback) => {
          if (!this.state.on) {
            this.state.on = true
            this.state[PROPERTY_MODE] = MODE_FAN
          }
          this.state[PROPERTY_FAN_LEVEL] = value === Characteristic.TargetFanState.AUTO
            ? FAN_LEVEL_AUTO
            : FAN_LEVEL_LOW
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        })
    }

    // TODO why won't this service show up in HomeKit?
    handleSwing () {
      const VerticalSwing = this.addService(Service.Slat, `${this.name} Vane`)
      VerticalSwing.setCharacteristic(Characteristic.SlatType)
        .on('get', callback => callback(null, Characteristic.SlatType.VERTICAL))
      VerticalSwing.getCharacteristic(Characteristic.CurrentSlatState)
        .on('get', callback => {
          const swingMoving = this.state[PROPERTY_SWING] === SWING_MOVING
            ? Characteristic.CurrentSlatState.SWINGING
            : Characteristic.CurrentSlatState.FIXED
          callback(null, swingMoving)
        })
      VerticalSwing.getCharacteristic(Characteristic.CurrentTiltAngle)
        .on('get', callback => {
          const tiltAngle = this.state[PROPERTY_SWING] === SWING_HIGH
            ? 45
            : this.state[PROPERTY_SWING] === SWING_MIDDLE
            ? 0
            : this.state[PROPERTY_SWING] === SWING_LOW
            ? -45
            : this.state[PROPERTY_SWING] === SWING_STOPPED
            ? -90
            : null
          callback(null, tiltAngle)
        })
        .on('set', (value, callback) => {
          // TODO implement this
          this.debug(`Desired tilt angle: ${value}`)
          callback()
        })
    }

    handleThermostat () {
      const thermoStat = this.addService(Service.Thermostat, `${this.name} Thermostat`)
      thermoStat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', callback => {
          if (!this.state.on) {
            return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
          }
          const mode = this.determineMode()
          callback(null, mode)
        })
      thermoStat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', callback => {
          if (!this.state.on) {
            return callback(null, Characteristic.TargetHeatingCoolingState.OFF)
          }
          const mode = this.determineMode()
          callback(null, mode)
        })
        .on('set', (value, callback) => {
          if (value === Characteristic.TargetHeatingCoolingState.OFF) {
            this.state.on = false
          } else {
            if (!this.state.on) this.state.on = true
            const map = {
              [Characteristic.TargetHeatingCoolingState.HEAT]: MODE_HEAT,
              [Characteristic.TargetHeatingCoolingState.COOL]: MODE_COOL,
              [Characteristic.TargetHeatingCoolingState.AUTO]: MODE_AUTO
            }
            this.log('set target heating cooling state to', map[value])
            this.state[PROPERTY_MODE] = map[value]
          }
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        })

      thermoStat.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', callback => callback(null, this.sensor.temperature.toFixed(1)))
      thermoStat.getCharacteristic(Characteristic.TargetTemperature)
        .on('get', callback => {
          const temperature = this.state.temperatureUnit === TEMPERATURE_UNIT_CELSIUS
            ? this.state.targetTemperature
            : this.state.temperatureUnit === TEMPERATURE_UNIT_FAHRENHEIT
            ? toCelsius(this.state.targetTemperature)
            : null
          callback(null, temperature)
        })
        .on('set', (value, callback) => {
          if (!this.state.on) this.state.on = true
          if (!this.state.temperatureUnit) {
            this.state.temperatureUnit = this.temperatureUnit
          }
          const targetTemperature = this.state.temperatureUnit === TEMPERATURE_UNIT_CELSIUS
            ? Math.round(value)
            : toFahrenheit(value)
          this.log('set target temperature to', targetTemperature)
          this.state[PROPERTY_TARGET_TEMPERATURE] = targetTemperature
          this.platform.api.submitState(this.device.id, this.state)
            .then(() => {
              this.forceRefresh()
              callback()
            })
            .catch(error => {
              this.log.error(error)
              callback(error)
            })
        })

      thermoStat.getCharacteristic(Characteristic.TemperatureDisplayUnits)
        .on('get', callback => {
          callback(null,
            this.state.temperatureUnit === TEMPERATURE_UNIT_CELSIUS
            ? Characteristic.TemperatureDisplayUnits.CELSIUS
            : this.state.temperatureUnit === TEMPERATURE_UNIT_FAHRENHEIT
            ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT
            : this.temperatureUnit)
        })
        .on('set', (value, callback) => {
          this.log('set temperatureUnit', value)
          callback()
        })
    }

    loadData () {
      this.refreshAll().then(() => {
        this.services
          .reduce(
            (out, service) => {
              return out.concat(service.characteristics)
            },
            []
          )
          .forEach(characteristic => {
            characteristic.getValue()
          })
      })
    }

    getServices () {
      return this.services
    }

    refreshAll () {
      return Promise.all([ this.refreshState(), this.refreshSensor() ])
    }

    forceRefresh() {
      this.state.updateTime = null
      this.sensor.updateTime = null
      this.loadData()
    }

    refreshCapabilities () {
      const now = Date.now()
      if (
        this.capabilities && this.capabilities.updateTime && now - this.state.updateTime < REFRESH_THRESHOLD
      ) {
        return Promise.resolve()
      }

      return this.platform.api.getCapabilities(this.device.id).then(capabilities => {
          //this.debug(`capabilities: ${JSON.stringify(capabilities)}`)
          if (!capabilities) return
          this.capabilities = Object.assign({}, capabilities, { updateTime: now})
        })
      }

    refreshState () {
      const now = Date.now()
      if (
        this.state && this.state.updateTime && now - this.state.updateTime < REFRESH_THRESHOLD
      ) {
        return Promise.resolve()
      }

      return this.platform.api.getState(this.device.id).then(state => {
        this.log.debug(`${this.name} state: ${JSON.stringify(state.acState)}`)
        if (!state) return
        var acState = state.acState
        // workaround for fan speed not being reported in dry mode
        /*if (!acState[PROPERTY_FAN_LEVEL]) {
          acState[PROPERTY_FAN_LEVEL] = FAN_LEVEL_AUTO
        }*/
        this.state = Object.assign({}, acState, { updateTime: now })
      })
    }

    refreshSensor () {
      const now = Date.now()
      if (this.sensor && this.sensor.updateTime && now - this.sensor.updateTime < REFRESH_THRESHOLD) {
        return Promise.resolve()
      }

      return this.platform.api.getMeasurements(this.device.id).then(data => {
        if (!data) return
        this.sensor = Object.assign({}, data[0], { updateTime: now })
      })
    }

    identify () {
      this.log(`Idenfity! (name: ${this.name})`)
    }

    logStateChange () {
      this.log(
        `Changed status (name: ${this.name}, temperature: ${this.sensor.temperature}, on: ${this.state.on}, mode: ${this.state.mode}, targetTemperature: ${this.state.targetTemperature}, fan speed: ${this.state.fanLevel})`
      )
    }

    determineMode () {
      return this.state.mode === MODE_HEAT
        ? Characteristic.CurrentHeatingCoolingState.HEAT
        : this.state.mode === MODE_COOL
        ? Characteristic.TargetHeatingCoolingState.COOL
        : this.state.mode === MODE_AUTO
        ? Characteristic.TargetHeatingCoolingState.AUTO
        : Characteristic.TargetHeatingCoolingState.OFF
    }
  }

  module.exports.SensiboPodAccessory = SensiboPodAccessory

  module.exports.REFRESH_THRESHOLD = REFRESH_THRESHOLD

  module.exports.BATTERY_MAX_VOLTAGE = BATTERY_MAX_VOLTAGE
  module.exports.BATTERY_MIN_VOLTAGE = BATTERY_MIN_VOLTAGE

  module.exports.TEMPERATURE_UNIT_CELSIUS = TEMPERATURE_UNIT_CELSIUS
  module.exports.TEMPERATURE_UNIT_FAHRENHEIT = TEMPERATURE_UNIT_FAHRENHEIT

  module.exports.MODE_COOL = MODE_COOL
  module.exports.MODE_DRY = MODE_DRY
  module.exports.MODE_HEAT = MODE_HEAT
  module.exports.MODE_FAN = MODE_FAN

  module.exports.FAN_LEVEL_HIGH = FAN_LEVEL_HIGH
  module.exports.FAN_LEVEL_MEDIUM = FAN_LEVEL_MEDIUM
  module.exports.FAN_LEVEL_LOW = FAN_LEVEL_LOW
  module.exports.FAN_LEVEL_AUTO = FAN_LEVEL_AUTO

  return SensiboPodAccessory
}
