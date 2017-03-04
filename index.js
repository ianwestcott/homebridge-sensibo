const Api = require('./lib/sensiboapi')
const pods = require('./accessories/pods')

module.exports = homebridge => {
  const { Service, Characteristic, Accessory, uuid } = homebridge.hap
  const SensiboPodAccessory = pods(Accessory, Service, Characteristic, uuid)

  class SensiboPlatform {
    constructor (log, config) {
      this.api = new Api(config.apiKey)
      this.log = log
      this.debug = log.debug
      this.devices = []
    }

    reloadData (callback) {
      this.debug('Refreshing Sensibo Data')
      this.devices.forEach(device => device.loadData())
    }

    refresh () {
      setInterval(this.reloadData(), 40000)
    }

    accessories (callback) {
      this.log('Fetching Sensibo devices...')
      this.devices = []
      this.api.getPods().then(pods => {
        pods.forEach(pod => {
          const accessory = new SensiboPodAccessory(this, pod)
          if (accessory) {
            this.log(`Device Added (Name: ${accessory.name}, ID: ${accessory.deviceid}, Group: ${accessory.deviceGroup})`)
            this.devices.push(accessory)
          }
        })
        this.refresh()
        callback(this.devices)
      }).catch(error => { console.error(error) })
    }
  }

  homebridge.registerPlatform('homebridge-sensibo', 'Sensibo', SensiboPlatform)
}
