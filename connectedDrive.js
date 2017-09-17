/**
 *      iobroker bmw Adapter Connected Drive class
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
/* jshint -W097 */
/*jslint node:true */
// jshint node:true, esversion:6, strict:global, undef:true, unused:true
"use strict";
const https = require('https');
const querystring = require('querystring');
const assert = require('assert');
const A = require('./myAdapter');

function BMWConnectedDrive() { // can be (username,password,server) or ({username:'x',password:'y',server:'z', array,flatten,delete, })
    if (!(this instanceof BMWConnectedDrive)) return new BMWConnectedDrive();

    const that = this;

    this._tokenType = null;
    this._token = null;
    this._tokenEndTime = Date.now();
    this._vehicles = {};
    this._remStart = '_RemoteControl_';
    this._rename = {};
    this._server = "www.bmw-connecteddrive.com";
    this._services = "efficiency, dynamic, navigation, remote_execution, remote_chargingprofile, remote_history, servicepartner, service, specs";
    this._delete = ""; // "modelType, series, basicType, brand, licensePlate, hasNavi, bodyType, dcOnly, hasSunRoof, hasRex, steering, driveTrain, doorCount, vehicleTracking, isoCountryCode, auxPowerRegular, auxPowerEcoPro, auxPowerEcoProPlus, ccmMessages",
    this._flatten = "attributesMap, vehicleMessages, cbsMessages, twoTimeTimer, characteristicList, lifeTimeList, lastTripList, remoteServiceEvent";
    this._arrays = "lastTripList|name|lastTrip|unit, specs|key|value, service|name|services, cdpFeatures|name|status, cbsMessages|text|date, lifeTimeList|name|value, characteristicList|characteristic|quantity, remote_history|eventId";
    this._retry = false;

    function request(_host, _path, _postData) {
        return (Date.now() > that._tokenEndTime && (!_postData || _postData === 'exec') ?
                requestToken().then(() => request(_host, _path, _postData), (err) => err) :
                _request(_host, _path, _postData))
            .then((res => {
                switch (res.statusCode) {
                    case 200:
                    case 302:
                        that._retry = false;
                        break;
                    case 503:
                        that._retry = false;
                        return Promise.reject(A.D(`Service unavailable. Please try later from ${_host}`));
                    case 401:
                        if (that._retry) {
                            that._retry = false;
                            return Promise.reject(`Authotization error with ${_host}! Please check your credentials!`);
                        }
                        that._retry = true;
                        return requestToken().then(() => request(_host, _path, _postData), (err) => err);
                    default:
                        that._retry = false;
                        res.data = A.D(`${_host}${_path} resulted status code: ${res.statusCode}: ${A.O(res.headers,1)}`);
                        break;
                }
                return res;
            }))

        function _request(_host, _path, _postData) {
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
                if (_postData === 'exec') {
                    _postData = '';
                    options.headers['Content-Length'] = '0';
                    options.headers['Content-Type'] = 'application/json;charset=utf-8';
                }
                if (typeof (that._token) === "string" && that._token.length > 0) {
                    options.headers.Authorization = that._tokenType + " " + that._token;
                    options.headers.Accept = 'application/json, text/plain, */*';
                    options.headers['User-Agent'] = "MCVApp/1.5.2 (iPhone; iOS 9.1; Scale/2.00)";
                }

                const req = https.request(options, (res) => {
                    const ret = {
                        data: '',
                        headers: res.headers,
                        statusCode: res.statusCode,
                    };

                    res.setEncoding('utf8');
                    res.on('data', (chunk) => ret.data += chunk);
                    res.on('end', () => _res(ret));
                });

                //            req.setTimeout(10000,() => _res(`Request for '${_path}' timed out!`, req.abort()));
                req.on('socket', (socket) => socket.setTimeout(10000, () => req.abort())); //causes error event ↑
                req.on('error', (e) =>
                    _rej(A.W(`BMWrequest error on path ${_path}: ${A.O(e)}`, e)));

                if (!!_postData)
                    req.write(_postData);
                req.end();
            });
        }
    }

    function requestToken() {
        that._tokenType = null;
        that._token = null;
        that._tokenEndTime = 0;
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
            .then(res => {
                let json = A.J(res);

                if (typeof (json.error) !== 'undefined')
                    return Promise.reject(json.error + ": " + json.error_description);

                if (typeof (json.token_type) === 'undefined' || typeof (json.access_token) === 'undefined')
                    return Promise.reject("Couldn't get token, seems to be wrong username/password error!");

                that._tokenType = json.token_type;
                that._token = json.access_token;
                //                that._tokenEndTime = Date.now() + (1000 * 120);
                that._tokenEndTime = Date.now() + 1000 * (parseInt(json.expires_in) - 1200);

                return json;

            });
    }

    that.initialize = function (options) {
        A.D(`Initialize for server ${options.server}`);
        assert(typeof options === 'object', 'initialize BMW with an object containing server,');
        that._server = options.server || that._server;
        that._password = options.password || that._password;
        that._username = options.username || that._username;
        that._services = options.services || that._services;
        that._delete = options.delete || that._delete;
        that._flatten = options.flatten || that._flatten;
        that._arrays = options.arrays || that._arrays;
        that._lang = options.lang || 'de';
        if (!translateText[that._lang])
            that._lang = 'en';
        if (options.rename && options.rename.trim().length > 0) {
            let rp = options.rename.split(',');
            for (var i of rp) {
                let vp = i.split('|').map(s => s.trim().replace(/\./g, '_'));
                if (vp.length !== 2) A.W(`rename config error: need always from|to pairs separated by '|'! which is not true for ${i}!`);
                else {
                    if (that._rename.hasOwnProperty(vp[0]) || that._rename.hasOwnProperty(vp[1]))
                        A.W(`rename config error: names should not be used twice (on any side od rename, ${vp[0]} or ${vp[1]} was used already!`);
                    else {
                        that._rename[vp[0]] = vp[1];
                        that._rename[vp[1]] = vp[0];
                    }
                }
            }
        }
        return requestToken()
            .then(() => A.D(`Initialized, client_id= ${A.O(that._token)}`))
            .catch(err => A.D(`Initialization err, client_id= ${A.O(err)}`));
    };

    const reviewer = (key, value) => typeof value !== 'string' ? value : isNaN(value) ? value : value % 1 === 0 ? parseInt(value) : parseFloat(value);

    const translateText = {
            de: {
                RCT: '_remove_',
                RCN: 'StarteKlima',
                RDL: 'Versperren',
                RDU: 'Aufsperren',
                RHB: 'StarteHupe',
                RLF: 'StarteLichthupe',
                EXECUTED: 'Ausgeführt',
                DELIVERED_TO_VEHICLE: 'An Farzeug gesendet',
                PENDING: 'In Bearbeitung',
                ABORTED: 'Abgebrochen!',
                NOT_STARTED: 'Nicht gestartet',
                _RefreshData: '_DatenNeuLaden',
                _LastGood: '_LetzterDatenabrufOK',
                _LastError: '_LetzerFehler',
            },
            en: {
                RCT: '_remove_',
                RCN: 'StartClimatisation',
                RDL: 'LockDoors',
                RDU: 'UnlockDoors',
                RHB: 'UseHorn',
                RLF: 'UseLight',
            }
        },
        rService = 'service';

    that.translate = function (text) {
        let trt = translateText[that._lang];
        let res = trt[text];
        return res ? res : '_' + text;
    }

    that.rename = function (text) {
        let found = that._rename[text];
        return found ? found : text;
    }

    that.renameTranslate = (text) => that.rename(that.translate(text));

    function getServices(service) {
        for (let i of service)
            if (i.name == 'cdpFeatures')
                for (var j of i.services) {
                    if (j.status == 'ACTIVE' &&
                        j.portfolioId &&
                        j.portfolioId.indexOf('RemoteOffer') > 0 &&
                        j.name.length == 3 &&
                        j.name.startsWith('R') && that.renameTranslate(j.name) != '_remove_') {
                        service.push({
                            name: that._remStart + that.renameTranslate(j.name),
                            services: j.name
                        });
                    }
                }
        return service;
    }

    that.executeService = function (service, code) {
        code = code.trim();
        if (that._execute || that._block || that._blocknext)
            return Promise.reject(A.W(`Cannot execute remote service ${code} for ${service} because other service is still executing!`));
        that._execute = true;
        let id = service.startsWith(A.ain) ? service.slice(A.ain.length) : service,
            vin = that.rename(id.split('.')[0]),
            path = `/api/vehicle/remoteservices/v1/${vin}/${code}`,
            pathe = `/api/vehicle/remoteservices/v1/${vin}/state/execution`,
            evid;
        A.D(`I should execute ${code} for ${service} on ${vin} with path ${path}!`);
        return request(that._server, path, 'exec')
            .then(res =>
                A.J(res.data, reviewer),
                err => `error ${err}`)
            .then(res => A.D(`execute ${code} for ${service} resulted in: ${A.O(res)}`, res))
            .then(res => {
                if (res && res.nextRequestInSec !== undefined)
                    that._blocknext = A.wait(parseInt(res.nextRequestInSec) * 1000).then(() => that._blocknext = false);

                evid = res.remoteServiceEvent.eventId;
                that._block = true;
                let tries = 20;
                A.makeState(id, that.translate(res.remoteServiceEvent && res.remoteServiceEvent.remoteServiceStatus ? res.remoteServiceEvent.remoteServiceStatus : 'ERROR'), true)
                    .catch(() => true).then(() => A.while(
                        () => that._block,
                        () => A.wait(5000) // check every 5 sec for execution
                        .then(() => request(that._server, pathe))
                        .then(res =>
                            A.J(res.data, reviewer),
                            err => A.D(`request remotecontrol exec err: ${err}`, that._block = false))
                        .then(res => {
                            A.D(`execute ${code} state/execution: ${A.O(res)}`);
                            if (res.eventId != evid || --tries < 0)
                                return A.makeState(id, that.translate('ABORTED'), (that._block = false, A.W(`Remote ${id} timed out and set to '${that.translate('ABORTED')}'!`, true)));
                            switch (res.remoteServiceStatus) {
                                default:
                                    case 'EXECUTED':
                                    that._block = false;
                                break;
                                case 'PENDING':
                                        case 'DELIVERED_TO_VEHICLE':
                                        break;
                            }
                            return A.makeState(id, that.translate(res.remoteServiceStatus), true);
                        }), 10));
            })
            .catch(err => A.D(` error in execution  ${code} for ${service} resulted in: ${A.O(err)}`, err))
            .then(() => that._execute = false);
    };

    function requestVehicle(_rootData) {
        const carData = _rootData;

        function requestVehicleData(_type) {
            let tres = null,
                otype = _type,
                start = 'vehicle/',
                version = '/v1/',
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
                case 'map_download':
                    start = 'me/';
                    _type = 'service/mapupdate/download';
                    break;
                case 'store':
                    start = '';
                    version = '/v2/';
                    end = '/offersAndPortfolios';
                    break;
                case 'offers':
                    start = '';
                    version = '/v2/';
                    end = '/offersAndPortfolios';
                    break;
                case 'dynamic':
                    end = `?offset=${new Date().getTimezoneOffset()}`;
                    break;
            }
            let path = `/api/${start}${_type}${version}${carData.vin}${end}`;
            A.D(`Request ${otype} for ${carData.vin} on ${path}`);
            return request(that._server, path)
                .then(res => res, err => A.D(`request for ${path} made error ${A.O(err)}`, ({
                    data: `{ "_error" : "${A.O(err)}" }`
                })))
                .then(res => A.J(tres = res.data.replace(/\n/g, ' '), reviewer))
                .then(res => res && A.debug ?
                    (A.T(res) === 'array' ?
                        (carData[nam + '._originalData'] = tres, res) :
                        (res._originalData = tres, res)) :
                    res)
                .then(res => otype == rService ? getServices(res) : res)
                .then(res => res.error ? res.error_description : (carData[nam] = res))
                .catch(e => A.W(`RequestServiceData Error ${e} for ${_type+end} with result: ${A.O(tres)}`, Promise.resolve()));
        }

        return A.seriesOf(that._services.split(',').map(x => x.trim()),requestVehicleData, 50)
            .then(() => convert(carData))
            .then(car => that._vehicles[that.rename(car._vin_ = carData.vin)] = A.I(`BMW car ${carData.vin} with ${Object.keys(car).length} data points received`, car)); // .catch(e => A.W(`RequestVehicleData Error ${e}`));
    }

    that.requestVehicles = function () {
        that.ocardata = undefined;
        return request(that._server, '/api/me/vehicles/v2')
            .then(res => res && res.data ? res.data : Promise.reject(res))
            .then(res => !A.debug ? res : that.ocardata = res)
            .then(res => A.J(res, reviewer))
            .then(res => res && Array.isArray(res) ? res : Promise.reject(res))
            .then(res => Promise.all(res.map(requestVehicle, this)))
            .catch(err => Promise.reject(`RequestVehicles Error to get data for Vehicles : ${A.O(err)}!`));
    };

    function convert(car) {
        const list = {},
            arrs = {},
            dell = that._delete.split(',').map(s => s.trim()),
            flatt = that._flatten.split(',').map(s => s.trim());

        function nl(list, n) {
            return flatt.includes(n) || flatt.includes(that.rename(n))  ? list : (list != '' ? list + '.' : '') + n;
        }

        function convObj(obj, namelist, last) {
            //        A.D(`confObj ${namelist}(${last}):${A.O(obj,1)}`)
            if (A.T(obj) == 'array') {
                if (obj.length === 0 || obj.length > 0 && A.T(obj[0]) !== 'object')
                    obj = obj.join(', ');
                else {
                    //                A.D(`${last}: ${arrs[last]} = ${A.O(obj)}`);
                    if (arrs[last] || arrs[that.rename(last)]) {
                        let m = arrs.hasOwnProperty(last) ? arrs[last] : arrs[that.rename(last)];
                        for (let j of obj) {
                            let n = j[m[0]];
                            if (dell.includes(n) || dell.includes(that.rename(n)))
                                continue;
                            n = that.rename(n)
                            if (m.length == 1) {
                                if (Object.keys(j).length > 1)
                                    delete j[m[0]];
                                n = n.indexOf('@') > 0 ? that.rename(n.split('@')[0]) : n;
                                convObj(j, nl(namelist, n), n);
                            } else {
                                let nn = n;
                                if (m.length == 3)
                                    nn = j[m[2]] === undefined ? n : j[m[2]] + '.' + n;
                                convObj(j[m[1]], nl(namelist, nn), nn);
                            }
                        }
                        return;
                    } else {
                        if (obj.length == 1) {
                            convObj(obj[0], namelist, last);
                        } else
                            for (let k in obj) {
                                convObj(obj[k], nl(namelist, 'item' + k), 'item' + k);
                            }
                    }
                }
            }
            if (A.T(obj) != 'object' && A.T(obj) != 'array')
                return (list[namelist] = obj);
            else if (A.T(obj) == 'object')
                for (let i in obj)
                    if (!(dell.includes(i) || dell.includes(that.rename(i))))
                        convObj(obj[i], nl(namelist, that.rename(i)), that.rename(i));
        }

        function carLocation(obj, lat, long) {
            return (obj && obj[lat] && obj[long]) ?
                A.get(`http://maps.googleapis.com/maps/api/geocode/json?latlng=${obj[lat]},${obj[long]}&sensor=true`)
                .then(res => {
                    obj.google_maps_link = `https://www.google.com/maps/dir/home/${obj[lat]},${obj[long]}/@?hl=${A.C.lang}`;
                    res = A.J(res);
                    if (obj && res && res.results && res.results[0] && res.results[0].formatted_address)
                        obj.formatted_address = res.results[0].formatted_address;
                    return A.D(`Added car location Maps-Link for ${obj.formatted_address} with ${lat}/${long}`);
                }) :
                Promise.resolve();
        }

        that._arrays.split(',').map(s => {
            let l = s.split('|').map(s => s.trim());
            arrs[l[0]] = l.slice(1);
        });

        return carLocation(car.dynamic.attributesMap, 'gps_lat', 'gps_lng')
            .then(() => carLocation(car.navigation, 'latitude', 'longitude'))
            .then(() => (convObj(car, ''), list), err => A.W(`Error in convert car data: ${err}`, list));
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

    Object.defineProperty(BMWConnectedDrive.prototype, "remStart", {
        get: () => rService + '.' + this._remStart
    });

    return this;
}

module.exports = BMWConnectedDrive;