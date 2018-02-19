const fetch = require('node-fetch')
const _ = require('lodash')
const debug = require('debug')('SensiboAPI')

const AC_STATE_PARAMETERS = [
  'on',
  'mode',
  'fanLevel',
  'targetTemperature',
  'temperatureUnit',
  'nativeTargetTemperature',
  'nativeTemperatureUnit',
  'swing'
]

function request (method, url, body) {
  const options = {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json' }
  }
  const fullUrl = `https://home.sensibo.com/api/v2/${url}`
  sanitizedUrl = fullUrl.substring(0, fullUrl.indexOf('?')) // don't log api key
  debug(`${options.method} ${sanitizedUrl}`)

  if (body) {
    options.body = JSON.stringify(body)
    debug(body)
  }

  return fetch(fullUrl, options).then(data => {
    body = JSON.parse(data.body.read().toString())
    if (data.status !== 200) {
      debug(`status was ${data.status}! body: ${JSON.stringify(body)}`)
      if (body.reason === 'OverriddenByOtherRequest') {
        debug('ignoring error response: OverriddenByOtherRequest')
      } else {
        throw new Error(`${data.status}, ${data.statusText}`)
      }
    }
    return body
  })
}

function post (url, body) {
  return request('post', url, body)
}

function patch (url, body) {
  return request('patch', url, body)
}

function get (url) {
  return request('get', url)
}

class Api {
  constructor (key) {
    this.key = key
  }

  getPods () {
    return get(`users/me/pods?fields=id,room&apiKey=${this.key}`).then(json => {
      if (json.status === 'success') return json.result
      return []
    })
  }

  getCapabilities (deviceID) {
    return get(`pods/${deviceID}?fields=remoteCapabilities&apiKey=${this.key}`).then(json => {
      if (json.status === 'success') return json.result.remoteCapabilities
      return {}
    })
  }

  getState (deviceID) {
    return get(`pods/${deviceID}/acStates?apiKey=${this.key}`).then(json => {
      const items = json.result.filter(item => item.status === 'Success')
      if (items.length) return items[0]
      return null
    })
  }

  getMeasurements (deviceID) {
    return get(
      `pods/${deviceID}/measurements?apiKey=${this.key}&fields=batteryVoltage,temperature,humidity`
    ).then(json => {
      if (json.status === 'success') return json.result
      return []
    })
  }

  submitState (deviceID, state) {
    var stateParameters = AC_STATE_PARAMETERS
    if (state.mode === 'fan') {
      stateParameters = stateParameters.filter(parameter => {
        return parameter != 'targetTemperature'})
    }
    debug(`using parameters: ${stateParameters}`)
    const data = {
      acState: _.pick(state, stateParameters)
    }
    return post(`pods/${deviceID}/acStates?apiKey=${this.key}`, data)
  }

  updateState (deviceID, property, value, currentState) {
    var stateParameters = AC_STATE_PARAMETERS
    if (currentState.mode === 'fan') {
      stateParameters = stateParameters.filter(parameter => {
        return parameter != 'targetTemperature'})
    }
    debug(`using parameters: ${stateParameters}`)
    const data = {
      newValue: value,
      currentAcState: _.pick(currentState, stateParameters)
    }
    return patch(
      `pods/${deviceID}/acStates/${property}?apiKey=${this.key}`,
      data
    )
  }
}

module.exports = Api
