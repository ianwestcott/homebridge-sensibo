var inherits = require('util').inherits;

var Accessory, Service, Characteristic, uuid;

/*
 *   Pod Accessory
 */

module.exports = function (oAccessory, oService, oCharacteristic, ouuid) {
	if (oAccessory) {
		Accessory = oAccessory;
		Service = oService;
		Characteristic = oCharacteristic;
		uuid = ouuid;

		inherits(SensiboPodAccessory, Accessory);
		SensiboPodAccessory.prototype.deviceGroup = 'pods';
		SensiboPodAccessory.prototype.loadData = loadData;
		SensiboPodAccessory.prototype.getServices = getServices;
		SensiboPodAccessory.prototype.refreshState = refreshState;
		SensiboPodAccessory.prototype.refreshTemperature = refreshTemperature;	
	
	}
	return SensiboPodAccessory;
};
module.exports.SensiboPodAccessory = SensiboPodAccessory;

function SensiboPodAccessory(platform, device) {
	
	this.deviceid = device.id;
	this.name = device.room.name;
	this.platform = platform;
	
	var idKey = 'hbdev:sensibo:pod:' + this.deviceid;
	var id = uuid.generate(idKey);
	
	Accessory.call(this, this.name, id);
	var that = this;

	//Items specific to Thermostats:
	this.refreshState();
	this.refreshTemperature();

	//Handle the Current State
	this
		.addService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
		.on('get', function (callback) {
			if (that.state_on) { //I need to verify this changes when the thermostat clicks on.
				switch (that.state_mode) {
					case "cool":
						callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
						break;
					case "heat": //HomeKit only accepts HEAT/COOL, so we have to determine if we are Heating or Cooling.
						callback(null, Characteristic.CurrentHeatingCoolingState.HEAT);
						break;
					default: //If it is fan_only or anything else then we'll report the thermostat as off.
						callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
						break;
				}
			} else //For now, powered being false means it is off
				callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
		});

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TargetHeatingCoolingState)
		.on('get', function (callback) {
			if (that.state_on) { //I need to verify this changes when the thermostat clicks on.
				switch (that.state_mode) {
					case "cool":
						callback(null, Characteristic.TargetHeatingCoolingState.COOL);
						break;
					case "heat":
						callback(null, Characteristic.TargetHeatingCoolingState.HEAT);
						break;
					default: //The above list should be inclusive, but we need to return something if they change stuff.
						callback(null, Characteristic.TargetHeatingCoolingState.OFF);
						break;
				}
			} else //For now, powered being false means it is off
				callback(null, Characteristic.TargetHeatingCoolingState.OFF);
		})
		.on('set', function (value, callback) {
			//switch (value) {
			//	case Characteristic.TargetHeatingCoolingState.COOL:
			//		that.updateWinkProperty(callback, ["powered", "mode"], [true, "cool_only"]);
			//		break;
			//	case Characteristic.TargetHeatingCoolingState.AUTO:
			//		that.updateWinkProperty(callback, ["powered", "mode"], [true, "auto_eco"]);
			//		break;
			//	case Characteristic.TargetHeatingCoolingState.OFF:
			//		that.updateWinkProperty(callback, "powered", false);
			//		break;
			//}
		});

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentTemperature)
		.on('get', function (callback) {
			that.refreshTemperature();
			callback(null, that.temp_temperature);
		});

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TargetTemperature)
		.on('get', function (callback) {
			callback(null, that.state_targetTemperature);
		})
		.on('set', function (value, callback) {
			//that.updateWinkProperty(callback, "max_set_point", value);
		});

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TemperatureDisplayUnits)
		.on('get', function (callback) {
			if (that.state_temperatureUnit == "C")
				callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
			else
				callback(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
		});

	//this
	//	.getService(Service.Thermostat)
	//	.addCharacteristic(Characteristic.RotationSpeed)
	//	.on('get', function (callback) {
	//		callback(null, Math.floor(that.device.last_reading.fan_speed * 100));
	//	})
	//	.on('set', function (value, callback) {
	//		that.updateWinkProperty(callback, "fan_speed", value / 100);
	//	});

	this.loadData();
}

	function refreshState(callback) {
		//This prevents this from running more often 
		var that=this;
		var rightnow = new Date();
		
		if (that.state_updatetime && (rightnow.getTime()-that.state_updatetime.getTime())<2000) { 
			if (callback !== undefined) callback();
			return
		}
		if (!that.state_updatetime) that.state_updatetime = rightnow; 
		//Update the State
		var data
		that.platform.api.getState(that.deviceid, function(myData) {
			data = myData;
		});
		while(data === undefined) {
      		require('deasync').runLoopOnce();
    		}

		if (data !== undefined && data.length>0 && data[0].status=="Success" && data[0].acState !== undefined) {
			that.state_on = data[0].acState.on;
			that.state_targetTemperature = data[0].acState.targetTemperature;
			that.state_temperatureUnit = data[0].acState.temperatureUnit;
			that.state_mode = data[0].acState.mode;
			that.state_fanLevel = data[0].acState.fanLevel;
			that.state_updatetime = new Date(); //Set our last update time.
		}		
	}
	
	function refreshTemperature(callback) {
		//This prevents this from running more often 
		var that=this;
		var rightnow = new Date();
		if (that.temp_updatetime && (rightnow.getTime()-that.temp_updatetime.getTime())<2000) { 
			if (callback !== undefined) callback();
			return
		}
		if (!that.temp_updatetime) that.state_updatetime = rightnow; 
		//Update the Temperature
		var data;
		that.platform.api.getMeasurements(that.deviceid, function(myData) {
			data = myData;
		});
		while(data === undefined) {
      		require('deasync').runLoopOnce();
    		}

		if (data !== undefined) {
		that.temp_temperature = data[0].temperature;
		that.temp_humidity = data[0].humidity;
		that.temp_updatetime = new Date(); //Set our last update time.
		}
	}

	function loadData() {
	this.refreshState();
	this.refreshTemperature();
	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
		.getValue();

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TargetHeatingCoolingState)
		.getValue();

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentTemperature)
		.getValue();

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TargetTemperature)
		.getValue();

	this
		.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TemperatureDisplayUnits)
		.getValue();

	//this
	//	.getService(Service.Thermostat)
	//	.getCharacteristic(Characteristic.RotationSpeed)
	//	.getValue();
	}

	function getServices() {
	return this.services;
	}
