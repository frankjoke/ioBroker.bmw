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
/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
"use strict";
const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = utils.adapter('bmw');

const util = require('util');
const http = require('http');
const https = require('https');
const exec = require('child_process').exec;
const querystring = require('querystring');
const xml2js = require('xml2js');
const assert = require('assert');


const A = { // my Adapter object encapsulating all my default adapter variables/functions and Promises
    isStopping: false,
    scanDelay: 5 * 60 * 1000, // in ms = 5 min
    scanTimer: null,

    stop: (dostop) => {
        A.isStopping = true;
        if (A.scanTimer)
            clearInterval(A.scanTimer);
        A.scanTimer = null;
        if (adapter && adapter.log && adapter.log.warn)
            A.W(`Adapter disconnected and stopped with (${dostop})`);
        if(dostop) {
            A.E("Adapter will exit in lates 2 sec!");
            setTimeout(process.exit,2000,55);
        }
    },

    res: (what) => Promise.resolve(what),
    rej: (what) => Promise.reject(what),
    wait: (time, arg) => new Promise(res => setTimeout(res, time, arg)),

    O: (obj, level) => util.inspect(obj, false, level || 2, false).replace(/\n/g, ' '),

    // function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 
    N: (fun) => setTimeout.apply(null, [fun, 0].concat(Array.prototype.slice.call(arguments, 1))), // move fun to next schedule keeping arguments
    D: (l, v) => (adapter.log.debug(l), v === undefined ? l : v),
    // D: (str, val) => (adapter.log.info(`<span style="color:darkblue;">debug: ${str}</span>`), val !== undefined ? val : str), // Write debug message in log, optionally return 2nd argument
    I: (l, v) => (adapter.log.info(l), v === undefined ? l : v),
    W: (l, v) => (adapter.log.warn(l), v === undefined ? l : v),
    E: (l, v) => (adapter.log.error(l), v === undefined ? l : v),
    T: (i) => {
        var t = typeof i;
        if (t === 'object') {
            if (Array.isArray(i)) t = 'array';
            else if (i instanceof RegExp) t = 'regexp';
            else if (i === null) t = 'null';
        } else if (t === 'number' && isNaN(i)) t = 'NaN';
        return t;
    },

    series: (obj, promfn, delay) => { // fun gets(item) and returns a promise
        assert(typeof promfn === 'function', 'series(obj,promfn,delay) error: promfn is not a function!');
        delay = parseInt(delay);
        let p = Promise.resolve();
        const nv = [],
            f = delay > 0 ? (k) => p = p.then(() => promfn(k).then(res => A.wait(delay, nv.push(res)))) :
            (k) => p = p.then(() => promfn(k));
        for (let item of obj)
            f(item);
        return p.then(() => nv);
    },

    c2p: (f) => {
        assert(typeof f === 'function', 'c2p (f) error: f is not a function!');
        if (!f)
            throw new Error(`f = null in c2pP definition!`);
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((err, result) => (err && rej(err)) || res(result));
                f.apply(this, args);
            });
        }
    },

    c1p: (f) => {
        assert(typeof f === 'function', 'c1p (f) error: f is not a function!');
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((result) => res(result));
                f.apply(this, args);
            });
        };
    },

    c1pe: (f) => { // one parameter != null = error
        assert(typeof f === 'function', 'c1pe (f) error: f is not a function!');
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((result) => !result ? res(result) : rej(result));
                f.apply(this, args);
            });
        };
    },

    retry: (nretry, fn, arg) => {
        assert(typeof fn === 'function', 'retry (,fn,) error: fn is not a function!');
        return fn(arg).catch(err => {
            if (nretry <= 0)
                throw err;
            return A.retry(nretry - 1, fn, arg);
        });
    },

    repeat: (nretry, fn, arg) => {
        assert(typeof fn === 'function', 'repeat (,fn,) error: fn is not a function!');
        return fn(arg).then(() => Promise.reject()).catch(err => {
            if (nretry <= 0)
                return Promise.resolve();
            return A.repeat(nretry - 1, fn, arg);
        });
    },

    exec: (command) => {
        assert(typeof fn === 'string', 'exec (fn) error: fn is not a string!');
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

    get: (url, retry) => { // get a web page either with http or https and return a promise for the data, could be done also with request but request is now an external package and http/https are part of nodejs.
        const fun = typeof url === 'string' && url.trim().toLowerCase().startsWith('https') ||
            url.protocol == 'https' ? https.get : http.get;
        return (new Promise((resolve, reject) => {
            fun(url, (res) => {
                const statusCode = res.statusCode;
                const contentType = res.headers['content-type'];
                if (statusCode !== 200) {
                    const error = new Error(`Request Failed. Status Code: ${statusCode}`);
                    res.resume(); // consume response data to free up memory
                    return reject(error);
                }
                res.setEncoding('utf8');
                var rawData = '';
                res.on('data', (chunk) => rawData += chunk);
                res.on('end', () => resolve(rawData));
            }).on('error', (e) => reject(e));
        })).catch(err => {
            if (!retry) reject(err);
            return A.wait(100, retry - 1).then(a => A.get(url, a));
        });
    },

    initAdapter: () => {
        A.ains = adapter.name + '.' + adapter.instance;
        A.ain = A.ains + '.';
        A.D(`Adapter ${A.ains} starting.`);
        A.getObjectList = A.c2p(adapter.objects.getObjectList),
            A.getForeignObject = A.c2p(adapter.getForeignObject),
            A.setForeignObject = A.c2p(adapter.setForeignObject),
            A.getForeignObjects = A.c2p(adapter.getForeignObjects),
            A.getForeignState = A.c2p(adapter.getForeignState),
            A.getState = A.c2p(adapter.getState),
            A.setState = A.c2p(adapter.setState),
            A.getObject = A.c2p(adapter.getObject),
            A.deleteState = (id) => A.c1pe(adapter.deleteState)(id).catch(res => res == 'Not exists' ? A.res() : A.rej(res)),
            A.delState = (id, opt) => A.c1pe(adapter.delState)(id, opt).catch(res => res == 'Not exists' ? A.res() : A.rej(res)),
            A.delObject = (id, opt) => A.c1pe(adapter.delObject)(id, opt).catch(res => res == 'Not exists' ? A.res() : A.rej(res)),
            A.removeState = (id, opt) => A.delState(id, opt).then(() => A.delObject(id, opt)),
            A.setObject = A.c2p(adapter.setObject),
            A.createState = A.c2p(adapter.createState),
            A.extendObject = A.c2p(adapter.extendObject);
        A.states = {};
        (!adapter.config.forceinit ?
            A.res({
                rows: []
            }) :
            A.getObjectList({
                startkey: A.ain,
                endkey: A.ain + '\u9999'
            }))
        .then(res => A.series(res.rows, (i) => A.removeState(A.D('deleteState: ' + i.doc.common.name, i.doc.common.name)), 2))
            .then(res => res, err => A.E('err from A.series: ' + err))
            .then(() => A.getObjectList({
                include_docs: true
            }))
            .then(res => {
                res = res && res.rows ? res.rows : [];
                A.objects = {};
                for (let i of res)
                    A.objects[i.doc._id] = i.doc;
                if (A.objects['system.config'] && A.objects['system.config'].common.language)
                    adapter.config.lang = A.objects['system.config'].common.language;
                if (A.objects['system.config'] && A.objects['system.config'].common.latitude) {
                    adapter.config.latitude = parseFloat(A.objects['system.config'].common.latitude);
                    adapter.config.longitude = parseFloat(A.objects['system.config'].common.longitude);
                }
                return res.length;
            }, err => A.E('err from getObjectList: ' + err, 'no'))
            .then(len => {
                A.D(`${adapter.name} received ${len} objects with config ${Object.keys(adapter.config)}`);
                //            A.D('System Objects: '+A.O(A.objects,5))
                adapter.subscribeStates('*');
                return main();
            }).catch(err => A.W(`Error in adapter.ready: ${err}`));
    },

    changeState: function (id, value, ack, always) {
        assert(typeof id === 'string', 'changeState (id,,,) error: id is not a string!');
        always = always === undefined ? false : !!always;
        ack = ack === undefined ? true : !!ack;
        return A.getState(id)
            .then(st => st && !always && st.val == value && st.ack == ack ? A.res() : A.setState(id, value, ack))
            .catch(err => A.W(`Error in A.setState(${id},${value},${ack}): ${err}`, A.setState(id, value, ack)));
    },

    makeState: function (ido, value, ack) {
        ack = ack === undefined || !!ack;
        let id = ido;
        if (typeof id === 'string')
            ido = id.endsWith('Percent') ? {
                unit: "%"
            } : {};
        else if (typeof id.id === 'string') {
            id = id.id;
        } else return Promise.reject(A.W(`Invalid makeState id: ${A.O(id)}`));
        if (A.states[id])
            return A.changeState(id, value, ack);
        //    A.D(`Make State ${id} and set value to:${A.O(value)} ack:${ack}`) ///TC
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

        return A.extendObject(id, st, null)
            .then(x => A.states[id] = x)
            .then(() => st.common.state == 'state' ? A.changeState(id, value, ack) : A.res())
            .catch(err => A.D(`MS ${A.O(err)}`, id));
    },

    processMessage: (obj) => {
        if (obj && obj.command) {
            A.D(`process Message ${A.O(obj)}`);
            switch (obj.command) {
                case 'ping': // Try to connect to mqtt broker
                    if (obj.callback && obj.message) {
                        ping.probe(obj.message, {
                            log: adapter.log.debug
                        }, function (err, result) {
                            adapter.sendTo(obj.from, obj.command, res, obj.callback);
                        });
                    }
                    break;
                case 'send': // e.g. send email or pushover or whatever
                    A.D(A.ains + ' send command from message');
                    if (obj.callback) // Send response in callback if required
                        adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                    break;
            }
        }
        adapter.getMessage((err, obj) => obj ? A.processMessage(obj) : null);
    }
}

adapter.on('message', obj => A.processMessage(obj));

adapter.on('ready', () => A.initAdapter());

adapter.on('unload', () => A.stop(false));

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
        } else {
            options.headers.Accept = 'application/json, text/plain, */*';
            options.headers['User-Agent'] = "MCVApp/1.5.2 (iPhone; iOS 9.1; Scale/2.00)";
        }

        //	A.D("Calling " + options.hostname + options.path);

        const req = https.request(options, (res) => {
            //		A.D('STATUSCODE: ' + res.statusCode);
            //		A.D('HEADERS: ' + JSON.stringify(res.headers));
            res.setEncoding('utf8');

            var data = "";

            res.on('data', (chunk) => data += chunk);
            res.on('end', () => _res({
                data: data.trim(),
                headers: res.headers
            }));
        });

        req.on('error', (e) => {
            A.W('BMWrequest error: ' + e.message);
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

            //            A.D('HEADERS: ' + A.O(res.headers));
            if (location === 'undefined')
                return A.rej("unexpected response, location header not defined");

            var values = querystring.parse(location);

            return JSON.stringify(values, null, 4);
        })
        .then(res => readTokenData(res));
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
            _res(A.D("Token expired, requesting a new one", requestToken()));

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
        .catch(err => A.W("Failed to use existing token from file, error " + err + ", will request a new one", requestToken()));
}

var vehicles = {};

function xmlParseString(body) {
    function parseNumbers(str) {
        if (!isNaN(str))
            str = str % 1 === 0 ? parseInt(str) : parseFloat(str);
        return str;
    }

    function tagnames(item) {
        let all = item.split(':');
        item = (all.length === 2) ? all[1] : all[0];
        //            _I(`Tag: all: ${_O(all)} became ${item}`);                
        return item;
    }
    return (A.c2p(new xml2js.Parser({
            explicitArray: false,
            trim: true,
            tagNameProcessors: [tagnames],
            //                attrNameProcessors: [tagnames],
            valueProcessors: [parseNumbers]
        })
        .parseString))(body);
}

function requestVehicle(_rootData) {
    var carData = _rootData;

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
        return BMWrequest(adapter.config.server, `/api/vehicle/${_type}/v1/${carData.vin}${end}`)
            .then(res => tres = res.data)
            .then(res => res.startsWith('<') ? xmlParseString(res) : JSON.parse(res))
            .then(res => res.error ? res.error_description : (carData[nam] = res))
            .catch(e => A.W(`RequestServiceData Error ${e} for ${_type+end} with result: ${A.O(tres)}`, A.res()));
    }

    return Promise.all(adapter.config.services.split(',').map(x => x.trim()).map(requestVehicleData, this))
        .then(() => convert(carData))
        .then(car => vehicles[carData.vin] = A.I(`Car ${carData.vin} with ${Object.keys(car).length} data points received`, car))
        .catch(e => A.W(`RequestVehicleData Error ${e}`));
}

function requestVehicles() {
    return BMWrequest(adapter.config.server, '/api/me/vehicles/v2')
        //        .then(res => pSeries(JSON.parse(res.data), veh => requestVehicle(veh)))
        .then(res => Promise.all(JSON.parse(res.data).map(requestVehicle)))
        .catch(e => A.W(`RequestVehicles Error ${e}`));
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
        //        A.D(`confObj ${namelist}(${last}):${A.O(obj,1)}`)
        if (A.T(obj) == 'array') {
            if (obj.length > 0 && A.T(obj[0]) != 'object')
                obj = obj.join(', ');
            else {
                //                A.D(`${last}: ${arrs[last]} = ${A.O(obj)}`);
                if (arrs[last]) {
                    let m = arrs[last]
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
            return list[namelist] = obj;
        else if (A.T(obj) == 'object')
            for (let i in obj)
                if (!dell.includes(i))
                    convObj(obj[i], flat.includes(i) ? namelist : ((namelist != '' ? namelist + '.' : '') + i), i)
    }
    return (car.navigation && car.navigation.latitude && car.navigation.longitude ?
            A.get(`http://maps.googleapis.com/maps/api/geocode/json?latlng=${car.navigation.latitude},${car.navigation.longitude}&sensor=true`) :
            A.res({
                results: [{
                    formatted_address: 'N/A'
                }]
            }))
        .then(res => {
            res = JSON.parse(res);
            if (car.navigation && res && res.results && res.results[0] && res.results[0].formatted_address)
                car.navigation.formatted_address = res.results[0].formatted_address;
            A.D(`Added car location ${car.navigation.formatted_address}`);
            return null;
        }).then(() => (convObj(car, ''), list))
        .catch(err => A.W(`Error in covert car data: ${err}`, list));
}

var wlast = null,
    lang = '',
    dataList = {};

function getCars() {
    dataList = {};
    A.states = {};
    return requestVehicles()
        .then(() => A.series(Object.keys(vehicles),
            car => A.series(Object.keys(vehicles[car]),
                id => A.makeState(A.D(`${ car+'.'+id}: ${vehicles[car][id]}`, car + '.' + id),
                    vehicles[car][id], true), 1)))
        .then(res => A.getObjectList({ // this check object list for old objects not transmitted anymore
            startkey: A.ain,
            endkey: A.ain + '\u9999'
        }))
        .then(res => A.series(res.rows, item => { // clean all states which are not part of the list
            let id = item.id.slice(A.ain.length);
            if (A.states[id])
                return A.res();
            A.I(`Delete unneeded ${A.O(item)}`);
            return A.removeState(id);
        }, 2))
        .catch(err => A.W(`Error in GetCars : ${err}`));
}

function main() {
    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay) < 5)
        A.W(`BMW Adapter scan delay was ${adapter.config.scandelay} set to 5 min!`, adapter.config.scandelay = 5);
    A.scanDelay = parseInt(adapter.config.scandelay) * 60 * 1000; // minutes

    adapter.config.server = A.T(adapter.config.server) == 'string' && adapter.config.server.length > 10 ? adapter.config.server : 'www.bmw-connecteddrive.com';

    A.I(`BMW scan ConnectedDrive every ${adapter.config.scandelay} minutes for the services ${adapter.config.services}.`);

    A.wait(100) // just wait a bit to give other background a chance to complete as well.
        .then(() => BMWinitialize())
        .then(x => A.D(`Initialized, client_id= ${A.O(token)}`))
        .then(res => { // everything fine, start timer and get gar data first time
            A.scanTimer = setInterval(getCars, A.scanDelay);
            return getCars(); // scan first time and generate states if they do not exist yet
        })
        .catch(err => {
            A.W(`BMW initialization finished with error ${A.O(err)}, will stop adapter!`);
            stop(true);
            throw err;
        })
        .then(x => A.I('BMW Adapter initialization finished!'));
}