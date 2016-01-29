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
		SensiboPodAccessory.prototype.refreshAll = refreshAll;
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
	this.state = {};
	
	var idKey = 'hbdev:sensibo:pod:' + this.deviceid;
	var id = uuid.generate(idKey);
	
	Accessory.call(this, this.name, id);
	var that = this;

	//HomeKit does really strange things since we have to wait on the data to get populated
	//This is just intro information. It will be corrected in a couple of seconds.
	that.state.on = false;
	that.state.targetTemperature = 25;
	that.state.temperatureUnit = 'F';
	that.state.mode = 'fan';
	that.state.fanLevel = 'auto';
	that.temp_temperature = 25;
	that.temp_humidity = 0;
	//End of initial information			

	this.loadData();
	this.addService(Service.Thermostat);
	
	//Handle the Current State
	this.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
		.on('get', function (callback) {
			if (that.state.on) { //I need to verify this changes when the thermostat clicks on.
				switch (that.state.mode) {
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
		})
		.on('set', function (value, callback) {
			callback();
			switch (value) {
				case Characteristic.TargetHeatingCoolingState.OFF:
					that.state.on = false;
					break;
				case Characteristic.TargetHeatingCoolingState.HEAT:
					that.state.on = true;
					that.state.fanLevel = 'auto';
					that.state.mode = 'heat';
					break;
				case Characteristic.TargetHeatingCoolingState.COOL:
					that.state.on = true;
					that.state.fanLevel = 'auto';
					that.state.mode = 'cool';
					break;
				case Characteristic.TargetHeatingCoolingState.AUTO:
					that.state.on = true;
					that.state.mode = 'fan';
					break;				
			};
			that.platform.api.submitState(that.deviceid, that.state);						
		});

//Current Temperature
	this.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentTemperature)
		.on('get', function(callback) {
			callback(null, that.temp_temperature); 	
		})

//Target Temperature
	this.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TargetTemperature)
		.on('get', function(callback) {
			callback(null, that.state.targetTemperature); 	
		})
		.on('set', function(value, callback) {
			callback();
			that.state.targetTemperature = value; 	
			that.platform.api.submitState(that.deviceid, that.state);
		})

	this.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.TemperatureDisplayUnits)
		.on('get', function(callback) {
			if (that.state.temperatureUnit=='F')
				callback(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT); 	
			else
				callback(null, Characteristic.TemperatureDisplayUnits.CELSIUS); 	
		})

	this.getService(Service.Thermostat)
		.getCharacteristic(Characteristic.CurrentRelativeHumidity)
		.on('get', function(callback) {
			callback(null, that.temp_humidity); 	 	
		})

	this.addService(Service.Fan)
		.getCharacteristic(Characteristic.On)
		.on('get', function(callback) {
			if (that.state.on && that.state.mode=='fan')
				callback(null, true);
			else
				callback(null, false); 	
		})
		.on('set', function(value, callback) {
			callback();
			if (value) {
				that.state.on=true;
				that.state.mode='fan';	
			} else {
				that.state.on=false;
			}
			that.platform.api.submitState(that.deviceid, that.state);
		})

	this.getService(Service.Fan)
		.getCharacteristic(Characteristic.RotationSpeed)
		.on('get', function(callback) {
			switch (that.state.fanLevel) {
				case 'low':
					callback(null,25);
					break;
				case 'medium':
					callback(null,50);
					break;
				case 'high':
					callback(null,100);
					break;
				case 'auto':
					callback(null,0);
					break;
			}
		})
		.on('set', function(value, callback) {
			callback();
			if (value==0)
				that.state.fanLevel='auto';
			else if (value<=40)
				that.state.fanLevel='low';
			else if (value<=75)
				that.state.fanLevel='medium';
			else if (value<=100)
				that.state.fanLevel='high';
			that.platform.api.submitState(that.deviceid, that.state);			 	
		})	
}

	function refreshState(callback) {
		//This prevents this from running more often 
		var that=this;
		var rightnow = new Date();
		
		if (that.state.updatetime && (rightnow.getTime()-that.state.updatetime.getTime())<2000) { 
			if (callback !== undefined) callback();
			return
		}
		if (!that.state.updatetime) that.state.updatetime = rightnow; 
		//Update the State
		that.platform.api.getState(that.deviceid, function(acState) {
			if (acState !== undefined ) {
				that.state.on = acState.on;
				that.state.targetTemperature = acState.targetTemperature;
				that.state.temperatureUnit = acState.temperatureUnit;
				that.state.mode = acState.mode;
				that.state.fanLevel = acState.fanLevel;
				that.state.updatetime = new Date(); //Set our last update time.
			}
			callback();
		});		
	}
	
	function refreshTemperature(callback) {
		//This prevents this from running more often 
		var that=this;
		var rightnow = new Date();
		if (that.temp_updatetime && (rightnow.getTime()-that.temp_updatetime.getTime())<2000) { 
			if (callback !== undefined) callback();
			return
		}
		if (!that.temp_updatetime) that.state.updatetime = rightnow; 
		//Update the Temperature
		var data;
		that.platform.api.getMeasurements(that.deviceid, function(myData) {
			data = myData;
			if (data !== undefined) {
				that.temp_temperature = data[0].temperature;
				that.temp_humidity = data[0].humidity;
				that.temp_updatetime = new Date(); //Set our last update time.
			}
			if (callback) callback();
		});
	}

    function refreshAll(callback) {
		var that=this;
		this.refreshState(function() { that.refreshTemperature(callback); });
	}
	
	function loadData() {
		var that = this;
		this.refreshAll(function() { 
		for (var i = 0; i < that.services.length; i++) {
			for (var j = 0; j < that.services[i].characteristics.length; j++) {
				that.services[i].characteristics[j].getValue();
			}
		}
		});			
	}

	function getServices() {
	return this.services;
	}
