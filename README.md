# homebridge-sensibo
[Homebridge](https://github.com/nfarina/homebridge) platform plugin for the Sensibo

This is a fork of [llun's fork](https://github.com/llun/homebridge-sensibo) of [pdlove's original plugin](https://github.com/pdlove/homebridge-sensibo). It contains the following modifications from the originals:

* Support for "Dry" mode via HomeKit HumidifierDehumidifier service
* Improved support for fan speed via HomeKit Fanv2 service
* Locally configurable temperature unit
* Support for adjusting swing state _(TODO: not yet functional)_
* Support for battery status reporting
* Support for checking device capabilities via Sensibo API _(TODO: Only activate functionality based on capabilities reported by Sensibo API)_

* Fixed bugs around handling of temperature unit between Sensibo API and HomeKit
* Fixed: Strip characters unsupported by HomeKit from Sensibo device name
* Improved state handling and mode switching
* Improved debug logging
* Improved handling of state parameters in Sensibo API
* Fixed: Don't log Sensibo API key

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-sensibo
3. Update your configuration file. See sample config.json snippet below.

# Configuration

Configuration sample:

 ```
"platforms": [
		{
			"platform": "Sensibo",
			"name": "Sensibo",
			"apiKey": "YOUR_SENSIBO_API_ID",
            "temperatureUnit": "F"
		}
	],

```

Fields:

* "platform": Must always be "Sensibo" (required)
* "name": Can be anything (required)
* "apiKey": Sensibo API key, must be obtained from https://home.sensibo.com/me/api (required)
* "temperatureUnit": Either "C" or "F"
