/**
 *      iobroker bmw Adapter Connected Drive class
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6, strict:global, undef:true, unused:true
"use strict";
const https = require('https');
const querystring = require('querystring');
const assert = require('assert');

function BMWConnectedDrive(myAdapter) { // can be (username,password,server) or ({username:'x',password:'y',server:'z', array,flatten,delete, })
    if (!(this instanceof BMWConnectedDrive)) return new BMWConnectedDrive(myAdapter);
    assert(myAdapter && myAdapter.T, 'First Argumen need to be my MyAdapter instance!');

    const that = this,
        A = myAdapter;

    this._tokenData = null;
    this._tokenType = null;
    this._token = null;
    this._tokenEndTime = Date.now();
    this._vehicles = {};
    this._server = "www.bmw-connecteddrive.com";
    this._services = "efficiency, dynamic, navigation, remote_execution, remote_chargingprofile, remote_history, servicepartner, service, specs";
    this._delete = ""; // "modelType, series, basicType, brand, licensePlate, hasNavi, bodyType, dcOnly, hasSunRoof, hasRex, steering, driveTrain, doorCount, vehicleTracking, isoCountryCode, auxPowerRegular, auxPowerEcoPro, auxPowerEcoProPlus, ccmMessages",
    this._flatten = "attributesMap, vehicleMessages, cbsMessages, twoTimeTimer, characteristicList, lifeTimeList, lastTripList, remoteServiceEvent";
    this._arrays = "lastTripList|name|lastTrip|unit, specs|key|value, service|name|services, cdpFeatures|name|status, cbsMessages|text|date, lifeTimeList|name|value, characteristicList|characteristic|quantity, remote_history|eventId";

    function clearToken() {
        that._tokenData = null;
        that._tokenType = null;
        that._token = null;
        that._tokenEndTime = Date.now();
    }

    function request(_host, _path, _postData) {
        return new Promise((_res, _rej) => {
            const options = {
                hostname: _host,
                port: '443',
                path: _path,
                method: !_postData ? 'GET' : 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }, //                'Content-Length': Buffer.byteLength(_postData)
            };

            if (typeof (that._token) === "string" && that._token.length > 0) {
                options.headers.Authorization = that._tokenType + " " + that._token;
                options.headers.Accept = 'application/json, text/plain, */*';
                options.headers['User-Agent'] = "MCVApp/1.5.2 (iPhone; iOS 9.1; Scale/2.00)";
            }

            //	A.D("Calling " + options.hostname + options.path);
            //            A.W('request token:' + A.O(that._token) +' options:'+ A.O(options) + ' ='+ A.O(_postData));
            const req = https.request(options, (res) => {
                //		A.D('STATUSCODE: ' + res.statusCode);
                //		A.D('HEADERS: ' + JSON.stringify(res.headers));
                const ret = {
                    data: '',
                    headers: res.headers
                };

                res.setEncoding('utf8');
                res.on('data', (chunk) => ret.data += chunk);
                res.on('end', () => _res(ret));
            });

            req.on('error', (e) => A.W('BMWrequest error: ' + e.message, _rej(e)));

            if (!!_postData)
                req.write(_postData);
            req.end();
        });
    }

    function requestToken() {
        clearToken();
        // Credit goes to https://github.com/sergejmueller/battery.ebiene.de
        const postData = querystring.stringify({
            'username': that._username,
            'password': that._password,
            'client_id': 'dbf0a542-ebd1-4ff0-a9a7-55172fbfce35',
            'redirect_uri': 'https://www.bmw-connecteddrive.com/app/default/static/external-dispatch.html',
            'response_type': 'token',
            'scope': 'authenticate_user fupo',
            'state': 'eyJtYXJrZXQiOiJkZSIsImxhbmd1YWdlIjoiZGUiLCJkZXN0aW5hdGlvbiI6ImxhbmRpbmdQYWdlIn0',
            'locale': 'DE-de'
        });

        return request('customer.bmwgroup.com', '/gcdm/oauth/authenticate', postData)
            .then(res => res.headers.location === undefined || res.headers.location === 'undefined' ?
                Promise.reject(`unexpected response, location header not defined: ${A.O(res.headers)}`) :
                JSON.stringify(querystring.parse(res.headers.location), null, 4))
            .then(res => readTokenData(res));
    }

    function readTokenData(data) {
        return new Promise((_res, _rej) => {
            let json = JSON.parse(data);

            if (typeof (json.error) !== 'undefined')
                return _rej(json.error + ": " + json.error_description);

            if (typeof (json.token_type) === 'undefined' || typeof (json.access_token) === 'undefined')
                return _rej("Couldn't get token, seems to be wrong username/password error!");

            that._tokenType = json.token_type;
            that._token = json.access_token;

            // CDP server seems to be picky, so be save and let the token expire two minutes earlier
            let tokenExpiresInSeconds = json.expires_in - 120,
                now = Date.now(),
                tokenFileExists = !!that._tokenData,
                expireTimestamp = tokenFileExists ? that._tokenEndTime : now + tokenExpiresInSeconds * 1000,
                expired = now > expireTimestamp;

            if (expired)
                _res(A.D("requestToken: Token expired, requesting a new one", requestToken()));

            if (!tokenFileExists) {
                that._tokenData = json;
                that._tokenEndTime = expireTimestamp;
            }
            _res(json);
        });
    }

    that.initialize = function (options) {
        A.D(`Initialized, client_id= ${A.O(options)}`);
        assert(typeof options === 'object', 'initialize BMW with an object containing server,');
        that._server = options.server || that._server;
        that._password = options.password || that._password;
        that._username = options.username || that._username;
        that._services = options.services || that._services;
        that._delete = options.delete || that._delete;
        that._flatten = options.flatten || that._flatten;
        that._arrays = options.arrays || that._arrays;
        return requestToken()
            .then(() => A.D(`Initialized, client_id= ${A.O(that._token)}`));
    };

    function requestVehicle(_rootData) {
        const carData = _rootData;

        function requestVehicleData(_type) {
            let tres = null,
                end = '',
                nam = _type.split('/').join('_');

            switch (_type) {
                case 'remote_chargingprofile':
                    _type = 'remoteservices/chargingprofile';
                    break;
                case 'remote_history':
                    _type = 'remoteservices';
                    end = '/history';
                    break;
                case 'remote_execution':
                    _type = 'remoteservices';
                    end = '/state/execution';
                    break;
            }
            return request(that._server, `/api/vehicle/${_type}/v1/${carData.vin}${end}`)
                .then(res => JSON.parse(tres = res.data))
                .then(res => res.error ? res.error_description : (carData[nam] = res))
                .catch(e => A.W(`RequestServiceData Error ${e} for ${_type+end} with result: ${A.O(tres)}`, Promise.resolve()));
        }

        return Promise.all(that._services.split(',').map(x => x.trim()).map(requestVehicleData, that))
            .then(() => convert(carData))
            .then(car => that._vehicles[carData.vin] = A.I(`BMW car ${carData.vin} with ${Object.keys(car).length} data points received`, car))
            .catch(e => A.W(`RequestVehicleData Error ${e}`));
    }

    that.requestVehicles = function () {
        return request(that._server, '/api/me/vehicles/v2')
            .then(res => Promise.all(JSON.parse(res.data).map(requestVehicle, this)))
            .catch(e => A.W(`RequestVehicles Error ${e}`));
    };

    function convert(car) {
        const list = {},
            arrs = {},
            dell = that._delete.split(',').map(s => s.trim()),
            flat = that._flatten.split(',').map(s => s.trim());

        function convObj(obj, namelist, last) {
            //        A.D(`confObj ${namelist}(${last}):${A.O(obj,1)}`)
            if (A.T(obj) == 'array') {
                if (obj.length > 0 && A.T(obj[0]) != 'object')
                    obj = obj.join(', ');
                else {
                    //                A.D(`${last}: ${arrs[last]} = ${A.O(obj)}`);
                    if (arrs[last]) {
                        let m = arrs[last];
                        for (let j of obj) {
                            let n = j[m[0]];
                            if (!dell.includes(n))
                                if (m.length == 1) {
                                    delete j[m[0]];
                                    n = n.split('@')[0];
                                    convObj(j, (namelist != '' ? namelist + '.' : '') + n, n);
                                } else
                                    convObj(j[m[1]], flat.includes(n) ? namelist : ((namelist != '' ? namelist + '.' : '') + n), n);

                        }
                        return;
                    }
                }
            }
            if (A.T(obj) != 'object' && A.T(obj) != 'array')
                return (list[namelist] = obj);
            else if (A.T(obj) == 'object')
                for (let i in obj)
                    if (!dell.includes(i))
                        convObj(obj[i], flat.includes(i) ? namelist : ((namelist != '' ? namelist + '.' : '') + i), i);
        }

        that._arrays.split(',').map(s => {
            let l = s.split('|').map(s => s.trim());
            arrs[l[0]] = l.slice(1);
        });

        return (car.navigation && car.navigation.latitude && car.navigation.longitude ?
                A.get(`http://maps.googleapis.com/maps/api/geocode/json?latlng=${car.navigation.latitude},${car.navigation.longitude}&sensor=true`) :
                Promise.resolve({}))
            .then(res => {
                res = JSON.parse(res);
                if (car.navigation && res && res.results && res.results[0] && res.results[0].formatted_address)
                    car.navigation.formatted_address = res.results[0].formatted_address;
                A.D(`Added car location ${car.navigation.formatted_address}`);
                return null;
            }).then(() => (convObj(car, ''), list))
            .catch(err => A.W(`Error in covert car data: ${err}`, list));
    }

    that.toString = () => `BMWConnectedDrive(${that._username},${that._server})=${that._token}`;

    Object.defineProperty(BMWConnectedDrive.prototype, "services", {
        get: () => this._services,
        set: (y) => this._services = y || this._services,
    });

    Object.defineProperty(BMWConnectedDrive.prototype, "delete", {
        get: () => this._delete,
        set: (y) => this._delete = y || this._delete,
    });

    Object.defineProperty(BMWConnectedDrive.prototype, "flatten", {
        get: () => this._flatten,
        set: (y) => this._flatten = y || this._flatten,
    });

    Object.defineProperty(BMWConnectedDrive.prototype, "arrays", {
        get: () => this._arrays,
        set: (y) => this._arrays = y || this._arrays,
    });

    Object.defineProperty(BMWConnectedDrive.prototype, "vehicles", {
        get: () => this._vehicles
    });

    Object.defineProperty(BMWConnectedDrive.prototype, "token", {
        get: () => this._token
    });

    return this;
}

module.exports = BMWConnectedDrive;