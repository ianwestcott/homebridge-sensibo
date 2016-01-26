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
	console.log(options.path);
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
		    console.log("response in http:", str);
		    try {
		    	str = JSON.parse(str);
		    } catch(e) {
		    	console.log(e.stack);
		    	console.log("raw message", str);
		    	str = undefined;
		    }

		    callback(str);
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
		GET({ path: 'users/me/pods?fields=id,room&apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				callback(data.result);
			} else {
				callback();
			}
		})
	},
	getState: function(deviceID, callback) {
		GET({ path: 'pods/'+deviceID+'/acStates?fields=status,reason,acState&limit=1&apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				callback(data.result);
			} else {
				callback();
			}
		})		
	},
	getMeasurements: function(deviceID, callback) {
		GET({ path: 'pods/'+deviceID+'/measurements?apiKey='+this.apiKey },function(data){
			if (data && data.status && data.status == 'success' && data.result && data.result instanceof Array) {
				callback(data.result);
			} else {
				callback();
			}
		})		
	} 
}

module.exports = sensibo;