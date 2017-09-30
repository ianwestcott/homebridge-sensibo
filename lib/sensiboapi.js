const fetch = require('node-fetch')
const _ = require('lodash')
const debug = require('debug')('SensiboAPI')

function request (method, url, body) {
  const options = {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json' }
  }
  const fullUrl = `https://home.sensibo.com/api/v2/${url}`
  debug(`${options.method} ${fullUrl}`)

  if (body) {
    options.body = JSON.stringify(body)
    debug(body)
  }

  return fetch(fullUrl, options).then(data => {
    if (data.status !== 200) {
      debug(data.body.read())
      throw new Error(`${data.status}, ${data.statusText}`)
    }
    return data.json()
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

  getState (deviceID) {
    return get(`pods/${deviceID}/acStates?apiKey=${this.key}`).then(json => {
      const items = json.result.filter(item => item.status === 'Success')
      if (items.length) return items[0]
      return null
    })
  }

  getMeasurements (deviceID) {
    return get(
      `pods/${deviceID}/measurements?apiKey=${this.key}`
    ).then(json => {
      if (json.status === 'success') return json.result
      return []
    })
  }

  submitState (deviceID, state) {
    const data = {
      acState: _.pick(state, [
        'on',
        'mode',
        'fanLevel',
        'targetTemperature',
        'temperatureUnit',
        'nativeTargetTemperature',
        'nativeTemperatureUnit',
        'swing'
      ])
    }
    return post(`pods/${deviceID}/acStates?apiKey=${this.key}`, data)
  }

  updateState (deviceID, property, value, currentState) {
    const data = {
      newValue: value,
      currentAcState: _.pick(currentState, [
        'on',
        'mode',
        'fanLevel',
        'targetTemperature',
        'temperatureUnit',
        'nativeTargetTemperature',
        'nativeTemperatureUnit',
        'swing'
      ])
    }
    return patch(
      `pods/${deviceID}/acStates/${property}?apiKey=${this.key}`,
      data
    )
  }
}

module.exports = Api
