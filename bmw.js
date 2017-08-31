/**
 *
 *      iobroker bmw Adapter
 *
 *      (c) 2016- <frankjoke@hotmail.com>
 *
 *      MIT License
 *
 */
/* eslint-env node,es6 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";
const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = utils.adapter('bmw');
const util = require('util');
const http = require('http');
const https = require('https');
const exec = require('child_process').exec;
const querystring = require('querystring');

function _O(obj, level) { return util.inspect(obj, false, level || 2, false).replace(/\n/g, ' '); }

// function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 
function _N(fun) { return setTimeout.apply(null, [fun, 0].concat(Array.prototype.slice.call(arguments, 1))); } // move fun to next schedule keeping arguments
//function _D(l, v) { adapter.log.debug(l); return v === undefined ? l : v; }
function _D(str, val) { adapter.log.info(`<span style="color:darkblue;">debug: ${str}</span>`); return val !== undefined ? val : str; } // Write debug message in log, optionally return 2nd argument
function _I(l, v) { adapter.log.info(l); return v === undefined ? l : v; }
function _W(l, v) { adapter.log.warn(l); return v === undefined ? l : v; }
function _T(i) {var t=typeof i; if(t==='object'){
    if(Array.isArray(i)) t = 'array'; 
    else if(i instanceof RegExp) t = 'regexp'; 
    else if(i===null) t = 'null'; } 
    else if(t==='number' && isNaN(i)) t='NaN'; 
    return t;
}

function wait(time, arg) { return new Promise(res => setTimeout(res, time, arg)) }

function pSeriesP(obj, promfn, delay) { // fun gets(item) and returns a promise
    delay = delay || 0;
    let p = Promise.resolve();
    const nv = [],
        f = (k) => p = p.then(() => promfn(k).then(res => wait(delay, nv.push(res))));
    for (let item of obj)
        f(item);
    return p.then(() => nv);
}
/*
function pSeriesInP(obj,promfn,delay) { // fun gets(key,obj) and returns a promise
    delay = delay || 0;
    let p = Promise.resolve();
    const   nv = [],
            f = (k) => p = p.then(() => promfn(k,obj).then(res => wait(delay,nv.push(res))));
    for(let item in obj) 
        f(item);
    return p.then(() => nv);
}

function pSeriesF(obj,fun,delay) { // fun gets(item) and returns a value
    delay = delay || 0;
    let p = Promise.resolve();
    const   nv = [],
            f = (k) => p = p.then(() => Promise.resolve(fun(k)).then(res => wait(delay,nv.push(res))));
    for(let item of obj) 
        f(item);
    return p.then(() => nv);
}
*/
function c2pP(f) {
    //    _D(`c2pP: ${_O(f)}`);
    return function () {
        const args = Array.prototype.slice.call(arguments);
        return new Promise((res, rej) => {
            args.push((err, result) => (err && _N(rej, err)) || _N(res, result));
            f.apply(this, args);
        });
    };
}

function c1pP(f) {
    return function () {
        const args = Array.prototype.slice.call(arguments);
        return new Promise((res, rej) => {
            args.push((result) => _N(res, result));
            f.apply(this, args);
        });
    };
}
/*
function pRetryP(nretry, fn, arg) {
    return fn(arg).catch(err => { 
        if (nretry <= 0) 
            throw err;
        return pRetryP(nretry - 1, fn,arg); 
    });
}

function pRepeatP(nretry, fn, arg) {
    return fn(arg).then(() => Promise.reject()).catch(err => { 
        if (nretry <= 0)
            return Promise.resolve();
        return pRepeatP(nretry - 1, fn,arg); 
    });
}

*/

var PgetObjectList = c2pP(adapter.objects.getObjectList),
    PgetForeignObject = c2pP(adapter.getForeignObject),
    PsetForeignObject = c2pP(adapter.setForeignObject),
    PgetForeignObjects = c2pP(adapter.getForeignObjects),
    PgetForeignState = c2pP(adapter.getForeignState),
    PgetState = c2pP(adapter.getState),
    PsetState = c2pP(adapter.setState),
    PgetObject = c2pP(adapter.getObject),
    PdeleteState = c2pP(adapter.deleteState),
    PdelObject = c2pP(adapter.delObject),
    PsetObject = c2pP(adapter.setObject),
    PcreateState = c2pP(adapter.createState),
    PextendObject = c2pP(adapter.extendObject);

var isStopping = false;
const scanList = new Map();
var scanDelay = 300 * 1000, // in ms = 5 min
    scanTimer = null; 

function stop(dostop) {
    isStopping = true;
    if (scanTimer)
        clearInterval(scanTimer);
    scanTimer = null;
    _W('Adapter disconnected and stopped');
    //    if (dostop)
    //        process.exit();
    //        adapter.stop();
}

adapter.on('message', obj => processMessage(obj));

adapter.on('ready', () => main());

adapter.on('unload', () => stop(false));

function processMessage(obj) {
    if (obj && obj.command) {
        _D(`process Message ${_O(obj)}`);
        switch (obj.command) {
            case 'ping': {
                // Try to connect to mqtt broker
                if (obj.callback && obj.message) {
                    ping.probe(obj.message, { log: adapter.log.debug }, function (err, result) {
                        adapter.sendTo(obj.from, obj.command, res, obj.callback);
                    });
                }
                break;
            }
        }
    }
    adapter.getMessage(function (err, obj) {
        if (obj) {
            processMessage(obj);
        }
    });
}

const objects = new Map();

function makeState(id, value, ack) {
    let a = ack ? true : false;
    if (objects.has(id))
        return PsetState(id, value, a);
    _D(`Make State ${id} and set value to '${_O(value)} ack: ${ack}'`) ///TC
    var st = {
        common: {
            name: id, // You can add here some description
            read: true,
            write: false,
            state: 'state',
            role: 'value',
            type: typeof value
        },
        type: 'state',
        _id: id
    };
    if (id.endsWith('Percent'))
        st.common.unit = "%";
    return PextendObject(id, st)
        .then(x => {
            objects.set(id, x);
            return PsetState(id, value, a);
        })
        .catch(err => _D(`MS ${_O(err)}:=extend`, id));

}

/*
function pExec(command) {
    const istest = command.startsWith('!');
    return new Promise((resolve, reject) => {
        exec(istest ? command.slice(1) : command, (error, stdout, stderr) => {
            if (istest && error) {
                error[stderr] = stderr;
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

function pGet(url, retry) {
    //    _I(`pGet retry(${retry}): ${url}`);
    return (new Promise((resolve, reject) => {
        //        _I(`pGet retry(${retry}): ${url}`);
        http.get(url, (res) => {
            let statusCode = res.statusCode;
            let contentType = res.headers['content-type'];
            //            _D(`res: ${statusCode}, ${contentType}`);
            let error = null;
            if (statusCode !== 200) {
                error = new Error(`Request Failed. Status Code: ${statusCode}`);
                //              } else if (!/^application\/json/.test(contentType)) {
                //                error = new Error(`Invalid content-type. Expected application/json but received ${contentType}`);
            }
            if (error) {
                res.resume();                 // consume response data to free up memory
                return reject(error);
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => rawData += chunk);
            res.on('end', () => _N(resolve, rawData));
        }).on('error', (e) => _N(reject, e));
    })).catch(err => {
        if (!(retry > 0)) throw err;
        return wait(100, retry - 1).then(a => pGet(url, a));
    });
}
*/

function BMWrequest(_host, _path, _postData) {
    return new Promise((_res, _rej) => {
        var hasToken = typeof (token.token) === "string" && token.token.length > 0;

        var options = {
            hostname: _host,
            port: '443',
            path: _path,
            method: hasToken ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(_postData)
            }
        };

        if (hasToken) {
            options.headers.Authorization = token.tokenType + " " + token.token;
        }

        //	_D("Calling " + options.hostname + options.path);

        const req = https.request(options, (res) => {
            //		_D('STATUSCODE: ' + res.statusCode);
            //		_D('HEADERS: ' + JSON.stringify(res.headers));
            res.setEncoding('utf8');

            var data = "";

            res.on('data', (chunk) => data += chunk);
            res.on('end', () => _res({ data: data, headers: res.headers }));
        });

        req.on('error', (e) => {
            _W('BMWrequest error: ' + e.message);
            _rej(e);
        });

        req.write(_postData);
        req.end();
    });
}

const token = {};

function clearToken() {
    token.data = null;
    token.tokenType = null;
    token.token = null;
    token.endTime = Date.now();
}

clearToken();

function requestToken() {
    clearToken();

    // Credit goes to https://github.com/sergejmueller/battery.ebiene.de
    const postData = querystring.stringify({
        'username': adapter.config.email,
        'password': adapter.config.password,
        'client_id': 'dbf0a542-ebd1-4ff0-a9a7-55172fbfce35',
        'redirect_uri': 'https://www.bmw-connecteddrive.com/app/default/static/external-dispatch.html',
        'response_type': 'token',
        'scope': 'authenticate_user fupo',
        'state': 'eyJtYXJrZXQiOiJkZSIsImxhbmd1YWdlIjoiZGUiLCJkZXN0aW5hdGlvbiI6ImxhbmRpbmdQYWdlIn0',
        'locale': 'DE-de'
    });

    return BMWrequest('customer.bmwgroup.com', '/gcdm/oauth/authenticate', _D(postData,postData))
        .then(res => {
            var location = res.headers.location;

            //            _D('HEADERS: ' + _O(res.headers));
            if (location === 'undefined')
                return _PE("unexpected response, location header not defined");

            var values = querystring.parse(location);

            return JSON.stringify(values, null, 4);
        })
        .then(res => readTokenData(res))
        ;
}

function readTokenData(data) {
    return new Promise((_res, _rej) => {
        var json = JSON.parse(data);

        if (typeof (json.error) !== 'undefined')
            return _rej(json.error + ": " + json.error_description);

        if (typeof (json.token_type) === 'undefined' || typeof (json.access_token) === 'undefined')
            return _rej("Couldn't find token in response");

        token.tokenType = json.token_type;
        token.token = json.access_token;

        // CDP server seems to be picky, so be save and let the token expire two minutes earlier
        var tokenExpiresInSeconds = json.expires_in - 120,
            now = Date.now(),
            tokenFileExists = !!token.data,
            expireTimestamp = tokenFileExists ? token.endTime : now + tokenExpiresInSeconds * 1000,
            expired = now > expireTimestamp;

        if (expired)
            _res(_D("Token expired, requesting a new one", requestToken()));

        if (!tokenFileExists) {
            token.data = json;
            token.endTime = expireTimestamp;
        }
        _res(json);
    });
}

function BMWinitialize() {
    if (!token.data)
        return requestToken();
    return readTokenData(token.data)
        .catch(err => _W("Failed to use existing token from file, error " + err + ", will request a new one", requestToken()));
}

var g_api_host = 'www.bmw-connecteddrive.de';
var vehicles = {};

function requestVehicle(_rootData) {
    var carData = _rootData;

    function requestVehicleData(_type) {
        return BMWrequest(g_api_host, '/api/vehicle/' + _type + '/v1/' + carData.vin, '')
            .then(res => carData[_type.split('/').slice(-1)[0]] = JSON.parse(res.data));
    }

    /*
    https://www.bmw-connecteddrive.de/api/vehicle/service/v1/vin
    https://www.bmw-connecteddrive.de/api/vehicle/dynamic/v1/vin?offset=-120
    https://www.bmw-connecteddrive.de/api/vehicle/specs/v1/vin
    https://www.bmw-connecteddrive.de/api/vehicle/navigation/v1/vin
    https://www.bmw-connecteddrive.de/api/vehicle/efficiency/v1/vin
    https://www.bmw-connecteddrive.de/api/vehicle/remoteservices/chargingprofile/v1/vin
    https://www.bmw-connecteddrive.de/api/vehicle/servicepartner/v1/vin
    */
    return Promise.all(adapter.config.services.split(',').map(x => x.trim()).map(requestVehicleData, this))
        .then(() => vehicles[carData.vin] = carData)
        .then(() => convert(carData))
        .catch(e => _W(`RequestVehicleData Error ${e}`));
}

function requestVehicles() {
    return BMWrequest(g_api_host, '/api/me/vehicles/v2', '')
        //        .then(res => pSeries(JSON.parse(res.data), veh => requestVehicle(veh)))
        .then(res => Promise.all(JSON.parse(res.data).map(requestVehicle)))
        .catch(e => _W(`RequestVehicles Error ${e}`));
}

function convert(car) {
    const corr = {
        specs: { name: 'key', value: 'value' },
        service: { name: 'name', value: 'services' },
        'service.cdpFeatures': { name: 'name', value: 'status' },
        'dynamic.vehicleMessages.cbsMessages': { name: 'text', value: 'date' },
        'efficiency.lastTripList': { name: 'name', value: 'lastTrip', flatten: true },
        'efficiency.lifeTimeList': { name: 'name', value: 'lifeTime', flatten: true },
        'efficiency.characteristicList': { name: 'characteristic', value: 'quantity', flatten: true },
        'efficiency.modelType': 'remove',
        series: 'remove',
        basicType: 'remove',
        brand: 'remove',
        licensePlate: 'remove',
        hasNavi: 'remove',
        bodyType: 'remove',
        dcOnly: 'remove',
        hasSunRoof: 'remove',
        hasRex: 'remove',
        steering: 'remove',
        driveTrain: 'remove',
        doorCount: 'remove',
        'navigation.vehicleTracking': 'remove',
        'navigation.isoCountryCode': 'remove',
        'navigation.auxPowerRegular': 'remove',
        'navigation.auxPowerEcoPro': 'remove',
        'navigation.auxPowerEcoProPlus': 'remove',
        'dynamic.attributesMap': 'flatten',
        'dynamic.vehicleMessages': 'flatten',
        'dynamic.cbsMessages': 'flatten',
        'chargingprofile.twoTimeTimer': 'flatten',
        'dynamic.ccmMessages': 'remove',
    };
    for (let i in corr) {
        const chg = corr[i];
        const dat = i.split('.');
        var e = car;
        var l = car;
        var ll = null;
        for (let j of dat) {
            l = e;
            ll = j;
            e = e[j];
            if (e === undefined) {
                l = null;
                break;
            }
        }
        if (l && chg == 'flatten') {
            for (let n in e)
                l[n] = e[n];
            delete l[ll];
        } else if (l && chg == 'remove') {
            delete l[ll];
        } else if (l && Array.isArray(e) && chg.name) {
            _D(`will try to convert ${i} in ${car.vin}`);
            var n = {};
            for (let k of e) {
                if (k[chg.name])
                    n[k[chg.name]] = k[chg.value];
            }
            l[ll] = n;
            if (chg.flatten) {
                for (let m in n)
                    l[m] = n[m];
                delete l[ll];
            }
        }
    }
}

var ain = '',
    wlast = null,
    lang = '',
    host = null,
    dataList = {};

function printCars(car, before) {
    let b = before ? before : '';
    if (_T(car) == 'object') {
        for (let i in car) {
            printCars(car[i],b== '' ? i : b + '.' + i);
        }
    } else 
        dataList[before] = _D(`${before}: ${car}`,car);
}

function getCars() {
    dataList = {};
    return requestVehicles()
        .then(() => printCars(vehicles))
        .then(() => pSeriesP(Object.keys(dataList), id => makeState(_D(`${id}: ${dataList[id]}`,id),dataList[id],true),1))
        ;    
}

function main() {
    host = adapter.host;
    ain = adapter.name + '.' + adapter.instance + '.';

    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay) < 300)
        adapter.config.scandelay = 300;
    scanDelay = adapter.config.scandelay * 1000;

    if (adapter.config.server)
        g_api_host = adapter.config.server;

    _I(`bmw set to scan every ${adapter.config.scandelay} sec.`);

    wait(100)
        .then(res => {
            return pSeriesP(adapter.config.devices, item => {
                _D(`checking item ${_O(item)}`);
                return Promise.resolve(item.id);
            }, 20);
        })
        .then(() => PgetObjectList({ include_docs: true }))
        .then(res => {
            var r = {};
            res.rows.map(i => r[i.doc._id] = i.doc)
            if (r['system.config'] && r['system.config'].common.language)
                lang = r['system.config'].common.language;
            if (r['system.config'] && r['system.config'].common.latitude) {
                adapter.config.latitude = parseFloat(r['system.config'].common.latitude);
                adapter.config.longitude = parseFloat(r['system.config'].common.longitude);
            } else return Promise.reject(_W('No geo location data found configured in admin to calculate UWZ AREA ID!'));
        })
        .then(x => x, err =>  null)
        .then(res => {
            _I(`bmw adapter initialized ${scanList.size} devices, ExternalNetwork = ${adapter.config.external}.`);
            //            scanTimer = setInterval(scanAll, scanDelay);
            //            if (parseInt(adapter.config.external) > 0)
            //                setInterval(scanExtIP, parseInt(adapter.config.external) * 1000);
            //            return scanAll(); // scan first time and generate states if they do not exist yet
        })
        .then(res => PgetObjectList({ startkey: ain, endkey: ain + '\u9999' }))
        .then(res => pSeriesP(res.rows, item => {  // clean all states which are not part of the list
            //            _I(`Check ${_O(item)}`);
            let id = item.id.slice(ain.length);
            if (objects.has(id))
                return Promise.resolve();
            //            _I(`Delete ${_O(item)}`);
            return PdeleteState(id)
                .then(x => _D(`Del State: ${id}`), err => _D(`Del State err: ${_O(err)}`)) ///TC
                .then(y => PdelObject(id))
                .then(x => _D(`Del Object: ${id}`), err => _D(`Del Object err: ${_O(err)}`)) ///TC
        }, 10))
        .then(() => BMWinitialize())
        .then(x => _D(`Initialized ${_O(token)}`))
//        .then(() => requestVehicles())
//        .then(x => _D(`Found vehicles: ${_O(vehicles,7)}`))
        .then(() => getCars())
    
        .catch(err => {
            _W(`bmw initialization finished with error ${_O(err)}, will stop adapter!`);
            stop(true);
            throw err;
        })
        .then(x => _I('Adapter initialization finished!'))
        ;
}
