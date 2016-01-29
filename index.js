var sensibo = require('./lib/sensiboapi');

var Service, Characteristic, Accessory, uuid;

var SensiboPodAccessory;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;
	uuid = homebridge.hap.uuid;

	SensiboPodAccessory = require('./accessories/pods')(Accessory, Service, Characteristic, uuid);

	homebridge.registerPlatform("homebridge-sensibo", "Sensibo", SensiboPlatform);
};

function SensiboPlatform(log, config) {
	// Load Wink Authentication From Config File
	this.apiKey = config["apiKey"];
	this.api=sensibo;
	this.log = log;
	this.deviceLookup = {};
}

SensiboPlatform.prototype = {
	reloadData: function (callback) {
		//This is called when we need to refresh all Wink device information.
		//this.log("Refreshing Sensibo Data");
		for (var i = 0; i < this.deviceLookup.length; i++) {
			this.deviceLookup[i].loadData();
		}
	},
	accessories: function (callback) {
		this.log("Fetching Sensibo devices.");

		var that = this;
		var foundAccessories = [];
		this.deviceLookup = [];

		var refreshLoop = function () {
			setInterval(that.reloadData.bind(that), 30000);
		};
		sensibo.init(this.apiKey);
		sensibo.getPods(function (devices) {
				// success
				for (var i = 0; i < devices.length; i++) {
					var device = devices[i];
					
					var accessory = undefined;
					accessory = new SensiboPodAccessory(that, device);

					if (accessory != undefined) {
						that.log("Device Added - Group " + accessory.deviceGroup + ", ID " + accessory.deviceid + ", Name " + accessory.name);
						that.deviceLookup.push(accessory);
						foundAccessories.push(accessory);
					}
				}
				refreshLoop();
				callback(foundAccessories);
		});
	}
};