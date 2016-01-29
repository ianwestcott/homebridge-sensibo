var http = require('https');

function _http(data, callback) {
	var options = {
	  hostname: "home.sensibo.com",
	  port: 443,
	  path: "/api/v2/" + data.path,
	  //since we are listening on a custom port, we need to specify it by hand
	  // port: '1337',
	  //This is what changes the request to a POST request
	  method: data.method,
	  headers: {}
	};
	var that=this;
	//console.log(options.path);
	if ( data.data ) {
		data.data = JSON.stringify(data.data);
		options.headers['Content-Length'] = Buffer.byteLength(data.data);
		options.headers['Content-Type'] = "application/json";
	}

	var str = '';
	var req = http.request(options, function(response) {

		response.on('data', function (chunk) {
	    	str += chunk;
		});

		response.on('end', function () {
		    if (data.debug) console.log("response in http:", str);
		    try {
		    	str = JSON.parse(str);
		    } catch(e) {
		    	if (data.debug) {
					console.log(e.stack);
		    		console.log("raw message", str);
				}
		    	str = undefined;
		    }

		    if (callback) callback(str);
		});
	});

	if ( data.data ) {
		req.write(data.data);
	}
	
	req.end();

	req.on('error', function(e) {
  		console.log("error at req: " ,e);
	});

}

function POST(data, callback) {
	data.method = "POST";
	_http(data, callback);
}

function PUT(data, callback) {
	data.method = "PUT";
	_http(data, callback);
}

function GET(data, callback) {
	data.method = "GET";
	_http(data, callback);
}

function DELETE(data, callback) {
	data.method = "DELETE";
	_http(data, callback);
}

var sensibo = { 
	init: function(inKey) {
		this.apiKey = inKey;
	}, 
	getPods: function(callback) {
		GET({ debug: false, path: 'users/me/pods?fields=id,room&apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				callback(data.result);
			} else {
				callback();
			}
		})
	},
	getState: function(deviceID, callback) {
		//We get the last 10 items in case the first one failed.
		GET({ debug: false, path: 'pods/'+deviceID+'/acStates?fields=status,reason,acState&limit=10&apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				var i=0;
				for (i=0; i<data.result.length; i++) {
					if (data.result[i].status=="Success") break;
				}
				if (i==data.result.length) i=0;
				callback(data.result[i].acState);
			} else {
				callback();
			}
		})		
	},
	
	getMeasurements: function(deviceID, callback) {
		GET({ debug: false, path: 'pods/'+deviceID+'/measurements?apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				callback(data.result);
			} else {
				callback();
			}
		})		
	},
	submitState: function(deviceID, state,callback) {
		var data = {};
		data.data = {'acState': {"on": state.on, 
							"targetTemperature": state.targetTemperature, 
							"mode": state.mode, "fanLevel": state.fanLevel}};
		data.path = 'pods/'+deviceID+'/acStates?apiKey='+this.apiKey;
		data.apiKey = this.apiKey;
		data.debug = true;
		POST(data, callback);
	} 
}

module.exports = sensibo;