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

const PROPERTY_ON = 'on'
const PROPERTY_MODE = 'mode'
const PROPERTY_FAN_LEVEL = 'fanLevel'
const PROPERTY_TARGET_TEMPERATURE = 'targetTemperature'
const PROPERTY_NATIVE_TARGET_TEMPERATURE = 'nativeTargetTemperature'
const PROPERTY_NATIVE_TEMPERATURE_UNIT = 'nativeTemperatureUnit'
const PROPERTY_SWING = 'swing'

function toCelsius (temperature) {
  return Math.round((temperature - 32) * 5 / 9);
}

function toFahrenheit (temperature) {
  return Math.round(temperature * 9 / 5 + 32);
}

module.exports = function (Accessory, Service, Characteristic, uuid) {
  class SensiboPodAccessory extends Accessory {
    constructor (platform, device) {
      super(device.room.name, uuid.generate(`hbdev:sensibo:pod:${device.id}`))
      this.device = device
      this.name = device.room.name
      this.platform = platform
      this.log = platform.log
      this.debug = platform.debug
      this.deviceGroup = 'pods'
      this.state = {
        targetTemperature: 72,
        nativeTargetTemperature: 22,
        temperatureUnit: TEMPERATURE_UNIT_FAHRENHEIT,
        nativeTemperatureUnit: TEMPERATURE_UNIT_CELSIUS,
        on: false,
        mode: MODE_COOL,
        fanLevel: FAN_LEVEL_AUTO
      }
      this.sensor = { temperature: 16, humidity: 0, batteryVoltage: 2600 }
      this.coolingThresholdTemperature = 24
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
      this.handleAll()
      this.loadData()
    }

    handleAll () {
      this.handleHumiditySensor()
      this.handleTemperatureSensor()
      this.handleSwitch()
      this.handleThermostat()
    }

    handleHumiditySensor () {
      this
        .addService(Service.HumiditySensor)
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', callback => callback(null, Math.round(this.sensor.humidity)))
    }

    handleTemperatureSensor () {
      this
        .addService(Service.TemperatureSensor)
          .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', callback => callback(null, this.sensor.temperature.toFixed(1)))
    }

    handleSwitch () {
      this
        .addService(Service.Switch)
          .getCharacteristic(Characteristic.On)
            .on('get', callback => callback(null, this.state.on))
            .on('set', (value, callback) => {
              const booleanValue = Boolean(value)
              this.platform.api.updateState(this.device.id, PROPERTY_ON, booleanValue, this.state)
                .then(() => {
                  this.state.on = booleanValue
                  callback()
                })
                .catch(error => {
                  this.log.error(error)
                  callback(error)
                })
            })
    }

    handleThermostat () {
      const thermoStat = this.addService(Service.Thermostat)
      thermoStat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', callback => {
          this.debug('get current heating cooling state')
          if (!this.state.on) {
            return callback(null, Characteristic.CurrentHeatingCoolingState.OFF)
          }
          // TODO support fan (and dry?) mode
          const mode = this.state.mode === MODE_HEAT
            ? Characteristic.CurrentHeatingCoolingState.HEAT
            : Characteristic.CurrentHeatingCoolingState.COOL
          callback(null, mode)
        })
      thermoStat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', callback => {
          this.debug('get target heating cooling state')
          if (!this.state.on) {
            return callback(null, Characteristic.TargetHeatingCoolingState.OFF)
          }
          const mode = this.state.mode === MODE_HEAT || this.state.mode === MODE_DRY
            ? Characteristic.TargetHeatingCoolingState.HEAT
            : this.state.mode === MODE_COOL
            ? Characteristic.TargetHeatingCoolingState.COOL
            : Characteristic.TargetHeatingCoolingState.AUTO
          callback(null, mode)
        })
        .on('set', (value, callback) => {
          if (value === Characteristic.TargetHeatingCoolingState.OFF) {
            this.getService(Service.Switch).setCharacteristic(Characteristic.On, false)
            return callback()
          }
          const map = {
            [Characteristic.TargetHeatingCoolingState.HEAT]: this.platform.config.heatAsDry ? MODE_DRY : MODE_HEAT,
            [Characteristic.TargetHeatingCoolingState.COOL]: MODE_COOL,
            [Characteristic.TargetHeatingCoolingState.AUTO]: MODE_AUTO
          }
          this.debug('set target heating cooling state', value, map[value])
          this.platform.api.updateState(this.device.id, PROPERTY_MODE, map[value], this.state)
            .then(() => {
              this.state.mode = map[value]
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
          this.debug('get target temperature')
          const temperature = this.state.temperatureUnit === TEMPERATURE_UNIT_CELSIUS
            ? this.state.targetTemperature
            : toCelsius(this.state.targetTemperature)
          callback(null, temperature)
        })
        .on('set', (value, callback) => {
          const targetTemperature = this.state.temperatureUnit === TEMPERATURE_UNIT_CELSIUS
            ? Math.round(value)
            : toFahrenheit(value)
          this.debug('set target temperature', targetTemperature)
          this.platform.api.updateState(this.device.id, PROPERTY_TARGET_TEMPERATURE, targetTemperature, this.state)
            .then(() => {
              this.state.targetTemperature = targetTemperature
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
            : Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
        })
        .on('set', (value, callback) => {
          this.debug('set temperatureUnit', value)
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

    refreshState () {
      const now = Date.now()
      if (
        this.state.updateTime && now - this.state.updateTime < REFRESH_THRESHOLD
      ) {
        return Promise.resolve()
      }

      return this.platform.api.getState(this.device.id).then(state => {
        if (!state) return
        this.state = Object.assign({}, state.acState, { updateTime: now })
      })
    }

    refreshSensor () {
      const now = Date.now()
      if (this.sensor.updateTime && now - this.sensor.updateTime < 2000) {
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
