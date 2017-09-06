/**
 *      iobroker MyAdapter class
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6, strict:global, undef:true, unused:true
"use strict";
const util = require('util');
const http = require('http');
const https = require('https');
const exec = require('child_process').exec;
const assert = require('assert');


function MyAdapter(ori_adapter) {
    let adapter = ori_adapter,
        that = this;

    assert(adapter && adapter.name, 'myAdapter:(adapter) no adapter here!');

    that.res = (what) => Promise.resolve(what);
    that.rej = (what) => Promise.reject(what);
    that.wait = (time, arg) => new Promise(res => setTimeout(res, time, arg));

    that.O = (obj, level) => util.inspect(obj, false, level || 2, false).replace(/\n/g, ' ');

    // function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 
    that.N = (fun) => setTimeout.apply(null, [fun, 0].concat(Array.prototype.slice.call(arguments, 1))); // move fun to next schedule keeping arguments
    that.D = (l, v) => (adapter.log.debug(l), v === undefined ? l : v);
//    that.D = (str, val) => (adapter.log.info(`<span style="color:darkblue;">debug: ${str}</span>`), val !== undefined ? val : str); // Write debug message in log, optionally return 2nd argument
    that.I = (l, v) => (adapter.log.info(l), v === undefined ? l : v);
    that.W = (l, v) => (adapter.log.warn(l), v === undefined ? l : v);
    that.E = (l, v) => (adapter.log.error(l), v === undefined ? l : v);
    that.T = (i) => {
        let t = typeof i;
        if (t === 'object') {
            if (Array.isArray(i)) t = 'array';
            else if (i instanceof RegExp) t = 'regexp';
            else if (i === null) t = 'null';
        } else if (t === 'number' && isNaN(i)) t = 'NaN';
        return t;
    };

    that.series = (obj, promfn, delay) => { // fun gets(item) and returns a promise
        assert(typeof promfn === 'function', 'series(obj,promfn,delay) error: promfn is not a function!');
        delay = parseInt(delay);
        let p = Promise.resolve();
        const nv = [],
            f = delay > 0 ? (k) => p = p.then(() => promfn(k).then(res => that.wait(delay, nv.push(res)))) :
            (k) => p = p.then(() => promfn(k));
        for (let item of obj)
            f(item);
        return p.then(() => nv);
    };

    that.c2p = (f) => {
        assert(typeof f === 'function', 'c2p (f) error: f is not a function!');
        if (!f)
            throw new Error(`f = null in c2pP definition!`);
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((err, result) => (err && rej(err)) || res(result));
                f.apply(this, args);
            });
        };
    };

    that.c1p = (f) => {
        assert(typeof f === 'function', 'c1p (f) error: f is not a function!');
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res) => {
                args.push((result) => res(result));
                f.apply(this, args);
            });
        };
    };

    that.c1pe = (f) => { // one parameter != null = error
        assert(typeof f === 'function', 'c1pe (f) error: f is not a function!');
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return new Promise((res, rej) => {
                args.push((result) => !result ? res(result) : rej(result));
                f.apply(this, args);
            });
        };
    };

    that.retry = (nretry, fn, arg) => {
        assert(typeof fn === 'function', 'retry (,fn,) error: fn is not a function!');
        return fn(arg).catch(err => {
            if (nretry <= 0)
                throw err;
            return that.retry(nretry - 1, fn, arg);
        });
    };

    that.repeat = (nretry, fn, arg) => {
        assert(typeof fn === 'function', 'repeat (,fn,) error: fn is not a function!');
        return fn(arg).then(() => Promise.reject()).catch(() => {
            if (nretry <= 0)
                return Promise.resolve();
            return that.repeat(nretry - 1, fn, arg);
        });
    };

    that.exec = (command) => {
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
    };

    that.get = (url, retry) => { // get a web page either with http or https and return a promise for the data, could be done also with request but request is now an external package and http/https are part of nodejs.
        const fun = typeof url === 'string' && url.trim().toLowerCase().startsWith('https') ||
            url.protocol == 'https' ? https.get : http.get;
        return (new Promise((resolve, reject) => {
            fun(url, (res) => {
                const statusCode = res.statusCode;
                //                const contentType = res.headers['content-type'];
                if (statusCode !== 200) {
                    const error = new Error(`Request Failed. Status Code: ${statusCode}`);
                    res.resume(); // consume response data to free up memory
                    return reject(error);
                }
                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', (chunk) => rawData += chunk);
                res.on('end', () => resolve(rawData));
            }).on('error', (e) => reject(e));
        })).catch(err => !retry ? Promise.reject(err) : that.wait(100, retry - 1).then(a => that.get(url, a)));
    };

    that.initAdapter = function () {
        that.states = {};
        that.ains = adapter.name + '.' + adapter.instance;
        that.ain = that.ains + '.';
        that.D(`Adapter ${that.ains} starting.`);
        that.getObjectList = that.c2p(adapter.objects.getObjectList);
        that.getForeignObject = that.c2p(adapter.getForeignObject);
        that.setForeignObject = that.c2p(adapter.setForeignObject);
        that.getForeignObjects = that.c2p(adapter.getForeignObjects);
        that.getForeignState = that.c2p(adapter.getForeignState);
        that.getState = that.c2p(adapter.getState);
        that.setState = that.c2p(adapter.setState);
        that.getObject = that.c2p(adapter.getObject);
        that.deleteState = (id) => that.c1pe(adapter.deleteState)(id).catch(res => res == 'Not exists' ? that.res() : that.rej(res));
        that.delState = (id, opt) => that.c1pe(adapter.delState)(id, opt).catch(res => res == 'Not exists' ? that.res() : that.rej(res));
        that.delObject = (id, opt) => that.c1pe(adapter.delObject)(id, opt).catch(res => res == 'Not exists' ? that.res() : that.rej(res));
        that.removeState = (id, opt) => that.delState(id, opt).then(() => that.delObject((delete that.states[id],id), opt));
        that.setObject = that.c2p(adapter.setObject);
        that.createState = that.c2p(adapter.createState);
        that.extendObject = that.c2p(adapter.extendObject);
        return (!adapter.config.forceinit ?
                that.res({
                    rows: []
                }) :
                that.getObjectList({
                    startkey: that.ain,
                    endkey: that.ain + '\u9999'
                }))
            .then(res => that.series(res.rows, (i) => that.removeState(that.D('deleteState: ' + i.doc.common.name, i.doc.common.name)), 2))
            .then(res => res, err => that.E('err from that.series: ' + err))
            .then(() => that.getObjectList({
                include_docs: true
            }))
            .then(res => {
                res = res && res.rows ? res.rows : [];
                that.objects = {};
                for (let i of res)
                    that.objects[i.doc._id] = i.doc;
                if (that.objects['system.config'] && that.objects['system.config'].common.language)
                    adapter.config.lang = that.objects['system.config'].common.language;
                if (that.objects['system.config'] && that.objects['system.config'].common.latitude) {
                    adapter.config.latitude = parseFloat(that.objects['system.config'].common.latitude);
                    adapter.config.longitude = parseFloat(that.objects['system.config'].common.longitude);
                }
                return res.length;
            }, err => that.E('err from getObjectList: ' + err, 'no'))
            .then(len => {
                that.D(`${adapter.name} received ${len} objects with config ${Object.keys(adapter.config)}`);
                //            that.D('System Objects: '+that.O(that.objects,5))
                adapter.subscribeStates('*');
                //                return main();
            }).catch(err => that.W(`Error in adapter.ready: ${err}`));
    };

    that.changeState = function (id, value, ack, always) {
        assert(typeof id === 'string', 'changeState (id,,,) error: id is not a string!');
        always = always === undefined ? false : !!always;
        ack = ack === undefined ? true : !!ack;
        return that.getState(id)
            .then(st => st && !always && st.val == value && st.ack == ack ? that.res() : that.setState(id, value, ack))
            .catch(err => that.W(`Error in that.setState(${id},${value},${ack}): ${err}`, that.setState(id, value, ack)));
    };

    that.makeState = function (ido, value, ack) {
        ack = ack === undefined || !!ack;
        let id = ido;
        if (typeof id === 'string')
            ido = id.endsWith('Percent') ? {
                unit: "%"
            } : {};
        else if (typeof id.id === 'string') {
            id = id.id;
        } else return Promise.reject(that.W(`Invalid makeState id: ${that.O(id)}`));
        if (that.states[id])
            return that.changeState(id, value, ack);
        //    that.D(`Make State ${id} and set value to:${that.O(value)} ack:${ack}`) ///TC
        const st = {
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

        return that.extendObject(id, st, null)
            .then(x => that.states[id] = x)
            .then(() => st.common.state == 'state' ? that.changeState(id, value, ack) : that.res())
            .catch(err => that.D(`MS ${that.O(err)}`, id));
    };

    that.processMessage = (obj) => {
        if (obj && obj.command) {
            switch (obj.command) {
                /*
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
                                    that.D(that.ains + ' send command from message');
                                    if (obj.callback) // Send response in callback if required
                                        adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                                    break;
                */
                default:
                    that.W(`Unkhandled Message ${that.O(obj)}`);
            }
        }
        adapter.getMessage((err, obj) => obj ? that.processMessage(obj) : null);
    };

    that.isStopping = false;
    that.scanTimer = null;

    that.stop = (dostop) => {
        that.isStopping = true;
        if (that.scanTimer)
            clearInterval(that.scanTimer);
        that.scanTimer = null;
        if (adapter && adapter.log && adapter.log.warn)
            that.W(`Adapter disconnected and stopped with (${dostop})`);
        if (dostop) {
            that.E("Adapter will exit in lates 2 sec!");
            setTimeout(process.exit, 2000, 55);
        }
    };

    return this;
}

module.exports = MyAdapter;