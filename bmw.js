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
const assert = require('assert');


function _O(obj, level) { return util.inspect(obj, false, level || 2, false).replace(/\n/g, ' '); }

// function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 
function _N(fun) { return setTimeout.apply(null, [fun, 0].concat(Array.prototype.slice.call(arguments, 1))); } // move fun to next schedule keeping arguments
function _D(l, v) { adapter.log.debug(l); return v === undefined ? l : v; }
//function _D(str, val) { adapter.log.info(`<span style="color:darkblue;">debug: ${str}</span>`); return val !== undefined ? val : str; } // Write debug message in log, optionally return 2nd argument
function _I(l, v) { adapter.log.info(l); return v === undefined ? l : v; }
function _W(l, v) { adapter.log.warn(l); return v === undefined ? l : v; }
function _E(l, v) { adapter.log.error(l); return v === undefined ? l : v; }
function _T(i) {
    var t = typeof i; if (t === 'object') {
        if (Array.isArray(i)) t = 'array';
        else if (i instanceof RegExp) t = 'regexp';
        else if (i === null) t = 'null';
    } else if (t === 'number' && isNaN(i)) t = 'NaN';
    return t;
}

const P = {
    res: (what) => Promise.resolve(what),
    rej: (what) => Promise.reject(what),
    wait: (time, arg) => new Promise(res => setTimeout(res, time, arg)),

    series: (obj, promfn, delay) =>  { // fun gets(item) and returns a promise
        assert(typeof promfn === 'function', 'series(obj,promfn,delay) error: promfn is not a function!');
        delay = parseInt(delay);
        let p = Promise.resolve();
        const nv = [],
            f = delay >0 ? (k) => p = p.then(() => promfn(k).then(res => P.wait(delay, nv.push(res))))
                : (k) => p = p.then(() => promfn(k));
        for (let item of obj)
            f(item);
        return p.then(() => nv);
    },

    c2p: (f) => {
        assert(typeof f === 'function', 'c2p (f) error: f is not a function!');
        if (!f)
            throw new Error(`f = null in c2pP definition!`);
        return function() {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((err, result) => (err && rej(err)) || res(result));
                f.apply(this, args);
            });
        }
    },

    c1p: (f) => {
        assert(typeof f === 'function', 'c1p (f) error: f is not a function!');
        return  function() {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((result) => res(result));
                f.apply(this, args);
            });
        };
    },

    c1pe: (f) => { // one parameter != null = error
        assert(typeof f === 'function', 'c1p (f) error: f is not a function!');
        return  function() {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((result) => !result ? res(result) : rej(result));
                f.apply(this, args);
            });
        };
    },

    retry: (nretry, fn, arg) => {
        return fn(arg).catch(err => { 
            if (nretry <= 0) 
                throw err;
            return P.retry(nretry - 1, fn,arg); 
        });
    },
    
    repeat: (nretry, fn, arg) => {
        return fn(arg).then(() => Promise.reject()).catch(err => { 
            if (nretry <= 0)
                return Promise.resolve();
            return P.repeat(nretry - 1, fn,arg); 
        });
    },

    exec: (command) => {
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
    },

    get: (url,retry) => {     // get a web page either with http or https and return a promise for the data, could be done also with request but request is now an external package and http/https are part of nodejs.
        const fun = typeof url === 'string' && url.trim().toLowerCase().startsWith('https') ||
            url.protocol == 'https' ? https.get : http.get;
        return (new Promise((resolve,reject)=> {
            fun(url, (res) => {
                const statusCode = res.statusCode;
                const contentType = res.headers['content-type'];
                if (statusCode !== 200) {
                    const error = new Error(`Request Failed. Status Code: ${statusCode}`);
                    res.resume();                 // consume response data to free up memory
                    return reject(error);
                }
                res.setEncoding('utf8');
                var rawData = '';
                res.on('data', (chunk) => rawData += chunk);
                res.on('end', () => resolve(rawData));
            }).on('error', (e) => reject(e));
        })).catch(err => {
            if (!retry) reject(err);
            return P.wait(100,retry -1).then(a => P.get(url,a));
        });
    },

    initAdapter: () => {
        P.ains = adapter.name + '.' + adapter.instance;
        P.ain = P.ains + '.';
        _D(`Adapter ${P.ains} starting.`);
        P.getObjectList = P.c2p(adapter.objects.getObjectList),
        P.getForeignObject = P.c2p(adapter.getForeignObject),
        P.setForeignObject = P.c2p(adapter.setForeignObject),
        P.getForeignObjects = P.c2p(adapter.getForeignObjects),
        P.getForeignState = P.c2p(adapter.getForeignState),
        P.getState = P.c2p(adapter.getState),
        P.setState = P.c2p(adapter.setState),
        P.getObject = P.c2p(adapter.getObject),
//        P.deleteState = P.c2p(adapter.deleteState),
        P.deleteState = (id) => P.c1pe(adapter.deleteState)(id).catch(res => res == 'Not exists' ? P.res() : P.rej(res)),
        P.delState = (id,opt) => P.c1pe(adapter.delState)(id,opt).catch(res => res == 'Not exists' ? P.res() : P.rej(res)),
        P.delObject = (id,opt) => P.c1pe(adapter.delObject)(id,opt).catch(res => res == 'Not exists' ? P.res() : P.rej(res)),
        P.removeState = (id,opt) => P.delState(id,opt).then(() => P.delObject(id,opt)),
        P.setObject = P.c2p(adapter.setObject),
        P.createState = P.c2p(adapter.createState),
        P.extendObject = P.c2p(adapter.extendObject);
//        P.myDeleteState = function(id,opt) { return P.deleteState(id,opt).catch(res => null)}
    },

}

var isStopping = false,
    scanDelay = 5 * 60 * 1000, // in ms = 5 min
    scanTimer = null;

function stop(dostop) {
    isStopping = true;
    if (scanTimer)
        clearInterval(scanTimer);
    scanTimer = null;
    _W('Adapter disconnected and stopped');
}

adapter.on('message', obj => processMessage(obj));

adapter.on('ready', () => {
    P.initAdapter();
    (!adapter.config.forceinit 
        ? P.res({rows:[]}) 
        : P.getObjectList({startkey: P.ain, endkey: P.ain + '\u9999'}))
        .then(res => P.series(res.rows, (i) => P.removeState(_D('deleteState: '+ i.doc.common.name,i.doc.common.name)),2))
        .then(res => res, err => _E('err from P.series: ' + err))
        .then(() => P.getObjectList({include_docs: true}))
        .then(res => {
            res = res && res.rows ? res.rows : []; 
            P.objects = {};
            for(let i of res) 
                P.objects[i.doc._id] = i.doc;
            if (P.objects['system.config'] && P.objects['system.config'].common.language)
                adapter.config.lang = P.objects['system.config'].common.language;
            if (P.objects['system.config'] && P.objects['system.config'].common.latitude) {
                adapter.config.latitude = parseFloat(P.objects['system.config'].common.latitude);
                adapter.config.longitude = parseFloat(P.objects['system.config'].common.longitude);
            }
            return res.length;
        }, err => _E('err from getObjectList: ' + err,'no'))
        .then(len => {
            _D(`${adapter.name} received ${len} objects with config ${_O(adapter.config)}`);
            _I('System Objects: '+_O(P.objects,5))
            adapter.subscribeStates('*');
            return main();
        }).catch(err => _W(`Error in adapter.ready: ${err}`));
});

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

function makeState(ido, value, ack) {
    ack = ack === undefined || !!ack;
    let id = ido;
    if (typeof id === 'string')
        ido = id.endsWith('Percent') ? {unit: "%"} : {};
    else if (typeof id.id === 'string') {
        id = id.id;
    } else return Promise.reject(_W(`Invalid makeState id: ${_O(id)}`));
    if (objects.has(id))
        return P.setState(id, value, ack);
    //    _D(`Make State ${id} and set value to:${_O(value)} ack:${ack}`) ///TC
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

    for (let i in ido)
        if (i != 'id' && i != 'val')
            st.common[i] = ido[i];

    return P.extendObject(id, st, null)
        .then(x => objects.set(id, x))
        .then(() => st.common.state == 'state' ? P.setState(id, value, ack) : P.res())
        .catch(err => _D(`MS ${_O(err)}`, id));
}

function BMWrequest(_host, _path, _postData) {
    return new Promise((_res, _rej) => {
        //        var hasToken = typeof (token.token) === "string" && token.token.length > 0;

        var options = {
            hostname: _host,
            port: '443',
            path: _path,
            method: !_postData ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                //                'Content-Length': Buffer.byteLength(_postData)
            }
        };

        if (typeof (token.token) === "string" && token.token.length > 0) {
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

        if (!!_postData)
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

    return BMWrequest('customer.bmwgroup.com', '/gcdm/oauth/authenticate', postData)
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
        return BMWrequest(g_api_host, '/api/vehicle/' + _type + '/v1/' + carData.vin)
            .then(res => JSON.parse(res.data))
            .then(res => res.error ? res.error_description : (carData[_type.split('/').slice(-1)[0]] = _D(_O(res), res)));
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
        .then(() => convert(carData))
        .then(car => vehicles[carData.vin] = _I(`Car ${carData.vin} with ${Object.keys(car).length} data points received`,car))
        .catch(e => _W(`RequestVehicleData Error ${e}`));
}

function requestVehicles() {
    return BMWrequest(g_api_host, '/api/me/vehicles/v2')
        //        .then(res => pSeries(JSON.parse(res.data), veh => requestVehicle(veh)))
        .then(res => Promise.all(JSON.parse(res.data).map(requestVehicle)))
        .catch(e => _W(`RequestVehicles Error ${e}`));
}

function convert(car) {
    var list = {},
        arrs = {},
        dell = adapter.config.delete.split(',').map(s => s.trim()),
        flat = adapter.config.flatten.split(',').map(s => s.trim()),
        arrl = adapter.config.arrays.split(',').map(s => {
            var l = s.split('|').map(s => s.trim());
            arrs[l[0]] = l.slice(1);
        });

    function convObj(obj, namelist, last) {
        if (_T(obj) == 'array') {
            if (obj.length > 0 && _T(obj[0]) != 'object')
                obj = obj.join(', ');
            else {
                //                _D(`${last}: ${arrs[last]} = ${_O(obj)}`);
                if (arrs[last]) {
                    let m = arrs[last]
                    for (let j of obj) {
                        let n = j[m[0]];
                        if (!dell.includes(n))
                            convObj(j[m[1]], flat.includes(n) ? namelist : ((namelist != '' ? namelist + '.' : '') + n), n)
                    }
                    return;
                }
            }
        }
        if (_T(obj) != 'object' && _T(obj) != 'array')
            return list[namelist] = obj;
        else if (_T(obj) == 'object')
            for (let i in obj)
                if (!dell.includes(i))
                    convObj(obj[i], flat.includes(i) ? namelist : ((namelist != '' ? namelist + '.' : '') + i), i)
    }
    return (car.navigation && car.navigation.latitude && car.navigation.longitude ? 
        P.get(`http://maps.googleapis.com/maps/api/geocode/json?latlng=${car.navigation.latitude},${car.navigation.longitude}&sensor=true`)
        : P.res({results: [{formatted_address:'N/A'}]}))
        .then(res => {
            res = JSON.parse(res);
            if (car.navigation && res && res.results && res.results[0] && res.results[0].formatted_address)
                car.navigation.formatted_address = res.results[0].formatted_address;
            _D(`Added car location ${car.navigation.formatted_address}`);
            return null;
        }).then(() => (convObj(car, ''),list))
        .catch(err => _W(`Error in covert car data: ${err}`,list))
        ;
}

var wlast = null,
    lang = '',
    dataList = {};


function getCars() {
    dataList = {};
    return requestVehicles()
        .then(() => P.series(Object.keys(vehicles), 
            car => P.series(Object.keys(vehicles[car]), 
                id => makeState(_D(`${ car+'.'+id}: ${vehicles[car][id]}`, car+'.'+id), 
                    vehicles[car][id], true), 1)))
//                id => P.res(id))))
        ;
}

function main() {
    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay) < 5)
        _W(`BMW Adapter scan delay was ${adapter.config.scandelay} set to 5 min!`,adapter.config.scandelay = 5);
    scanDelay = parseInt(adapter.config.scandelay) * 60* 1000; // minutes

    if (adapter.config.server)
        g_api_host = adapter.config.server;

    _I(`BMW set to scan data on ConnectedDrive every ${adapter.config.scandelay} minutes.`);

    P.wait(100)
        .then(() => BMWinitialize())
        .then(x => _D(`Initialized, client_id= ${_O(token)}`))
        /*        .then(() => P.getObjectList({ include_docs: true }))
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
                .then(x => x, err => null)
                //        .then(() => requestVehicles())
                //        .then(x => _D(`Found vehicles: ${_O(vehicles,7)}`))
        */
        .then(res => {
            scanTimer = setInterval(getCars, scanDelay);
            return getCars(); // scan first time and generate states if they do not exist yet
        })
        .then(res => P.getObjectList({ startkey: P.ain, endkey: P.ain + '\u9999' }))
        .then(res => P.series(res.rows, item => {  // clean all states which are not part of the list
            //            _I(`Check ${_O(item)}`);
            let id = item.id.slice(P.ain.length);
            if (objects.has(id))
                return P.res();
            //            _I(`Delete ${_O(item)}`);
            return P.removeState(id);
        }, 2))

        .catch(err => {
            _W(`BMW initialization finished with error ${_O(err)}, will stop adapter!`);
            stop(true);
            throw err;
        })
        .then(x => _I('BMW Adapter initialization finished!'))
        ;
}
