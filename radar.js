/**
 *
 *      iobroker radar Adapter
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
const utils   =   require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter =   utils.adapter('radar');
/*
function c2pA(f) {
    let context = this;
    return function () {
        let fArgs = Array.prototype.slice.call(arguments);
        let paramLength = f.length;
        let args = [];

        for (var i = 0; i < paramLength -1; i++) {
            if(i < fArgs.length){
                args.push(fArgs[i])
            }else{
                args.push(undefined);
            }
        }

        return new Promise((res, rej) => {
            args.push(function (err, result) {
                if (err) setTimeout(rej,0,err);
                else setTimeout(res,0,result);
            });

            f.apply(context, args);
        });
    }
}
*/

const util =      require('util');
const http =      require('http');
const xml2js =    require('xml2js');
const ping =      require('ping');
//const noble =     require('noble'); // will be loaded later because not all machines will have it working
var noble =        null;
const exec =      require('child_process').exec;

function _o(obj,level) {    return  util.inspect(obj, false, level || 2, false).replace(/\n/g,' ');}

function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 

function wait(time,arg) { return new Promise((res,rej) => setTimeout(res,time,arg))}

function pSeries(obj,fun) { // fun gets(key,obj,resolve,reject)
    let newValues = [];
    let promise = Promise.resolve(null);

    for(let key of obj) {
//        adapter.log.debug(`pSeries key ${_o(key)}`);
        promise = promise.then(() => 
            new Promise((resolve,reject) => process.nextTick(fun,key, obj, resolve, reject))
        ).then(newValue => newValues.push(newValue));
    }
    
    return promise.then(() => newValues);
}

function pRetryP(nretry, fn, arg) {
    return fn(arg).catch(err => { 
//            logs(`retry: ${retry}, ${_o(err)}`);
        if (nretry <= 0) {
            throw err;
        }
        return pRetryP(nretry - 1, fn,arg); 
    });
}

function pGet(url) {
//    let url = that.url+"control?callback=cb&x=" + Date.now() % 1000000 + "&cmd="+command
    return new Promise((resolve,reject)=> {
        adapter.log.debug(`pGet: ${url}`);
        http.get(url, (res) => {
            let statusCode = res.statusCode;
            let contentType = res.headers['content-type'];
            adapter.log.debug(`res: ${statusCode}, ${contentType}`);
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
            res.on('end', () => setTimeout(resolve,0,rawData));
        }).on('error', (e) => setTimeout(reject,0,e));
    });
}

function pGet2(command) { return pRetryP(2,pGet,command)}


var isStopping =    false;
const scanList =      new Map();
var scanDelay =     30*1000; // in ms = 30 sec
var scanTimer =     null;
var printerDelay =  100;
var printerCount =  0;
var delayAway =     10;
var countHere =       0;
var whoHere =       [];
var host =          null;

function stop(dostop) {
    isStopping = true;
    if (scanTimer)
        clearInterval(scanTimer);
    scanTimer = null;
    adapter.log.warn('Adapter disconnected and stopped');
    if (dostop)
        adapter.stop();
} 

adapter.on('message', obj => processMessage(obj));

adapter.on('ready', () => main());

adapter.on('unload', () => stop(false));

function processMessage(obj) {
    if (obj && obj.command) {
        adapter.log.debug(`process Message ${_o(obj)}`);
        switch (obj.command) {
            case 'ping': {
                // Try to connect to mqtt broker
                if (obj.callback && obj.message) {
                    ping.probe(obj.message, {log: adapter.log.debug}, function (err, result) {
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

function pSetState(id,value) {
    return new Promise((res,rej) => {
        adapter.setState(id,value,true, (err,val) => {
            if (err)
                return setTimeout(rej,0,err);
            return setTimeout(res,0,val);
        });
    });
}

function makeState(id,value) {
    if (objects.has(id))
        return pSetState(id,value);
    return new Promise((res,rej) => {
        var st = {
            common: {
                name:  id, // You can add here some description
                read:  true,
                write: false,
                state: 'state',
                role:  'value',
                type:  typeof value
            },
            type: 'state',
            _id: id
        };
        if (id.endsWith('Percent'))
            st.common.unit = "%";
        adapter.extendObject(id,st,function(err,obj) {
                if(err)
                    rej(err);
                else {
                    objects.set(id,obj);
                    adapter.log.debug(`created state ${id} with ${value}`)
                    res(pSetState(id,value));
                }
        });
    });
}


var nobleRunning = null;

function myNoble(len) {
    function stopNoble(idf) {
        if (nobleRunning)
            clearTimeout(nobleRunning);
        if (!noble)
            return {};
        nobleRunning = null;
        noble.removeAllListeners('discover');
        noble.stopScanning();
//        adapter.log.debug(util.format('Noble found %j',idf));
        return idf;
    }
    
    let idf = {};
    if (nobleRunning) 
        clearTimeout(nobleRunning);
    nobleRunning = null;

    return new Promise((res,rej) => {
        if (!noble) 
            return process.nextTick(res,{});

        if (isStopping)
            return process.nextTick(rej,"Stopping");
        
        if(noble.state !== 'poweredOn') 
            return process.nextTick(rej,'Noble not powered ON!');
        try {    
            noble.on('discover', function(per){
                if (isStopping) 
                    return res(stopNoble(idf));
                
                var idt = (per.advertisement && per.advertisement.localName )? per.advertisement.localName : "NaN";
                idf[per.address] = {
                    address: per.address,
                    name: idt,
                    rssi: per.rssi
                };
            });

            noble.startScanning([], true);
        } catch(e) {
            noble = null;
            return process.nextTick(res,{});
        }
        nobleRunning = setTimeout(() => res(stopNoble(idf)), len);

    })
}

function pExec(command) {
    const istest = command.startsWith('!');
    return new Promise((resolve,reject) => {
        exec(istest ? command.slice(1) : command, (error,stdout,stderr) => {
            if (istest && error) {
                error[stderr] = stderr;
                return reject(error);
            }
        resolve(stdout);
        });
    });
}

var doFping = true;
var doHci = true;
function scanHP(item) {
    function parseString(body) {
        function parseNumbers(str) {
            if (!isNaN(str)) 
                str = str % 1 === 0 ? parseInt(str) : parseFloat(str);
            return str;
        }
        return new Promise((res,rej) => {
            let parser = new xml2js.Parser({explicitArray:false,valueProcessors:[parseNumbers]});
            parser.parseString(body, (err,result) => {
                if (err) return setTimeout(rej,0,err);
                setTimeout(res,0,result);
            });
        });
    }


    let idn = item.id+'.';
    let colors = [];
    let below10 = false;

    return pGet2('http://'+item.ip+'/DevMgmt/ConsumableConfigDyn.xml')
        .then(body => parseString(body.trim()))
        .then(result => pSeries(result["ccdyn:ConsumableConfigDyn"]["ccdyn:ConsumableInfo"], 
            (item,po,res,rej) => {
//                    adapter.log.debug(`parser ${_o(i)} = ${_o(po)}`);
                if (item["dd:ConsumableTypeEnum"]!="ink")
                    return process.nextTick(res); 
                let p = "P" + item["dd:ConsumableStation"],
                    lc = item["dd:ConsumableLabelCode"],
                    idnc = idn + lc + '.',
                    d = item["dd:Installation"]["dd:Date"],
                    l = parseInt(item["dd:ConsumablePercentageLevelRemaining"]),
                    ci = item["dd:ConsumableIcon"],
                    s = ci["dd:Shape"],
                    fc = ci["dd:FillColor"],
                    rgb = fc["dd:Blue"] | (fc["dd:Green"] << 8) | (fc["dd:Red"] << 16),
                    n = item["dd:ConsumableSelectibilityNumber"];
                rgb = '#' + (0x1000000 + rgb).toString(16).slice(1);
                let ss = `${p} = ${lc}, ${d}, ${l}%, ${n}, ${rgb}, ${s}`;
                colors.push(ss);
                if (l<=10)
                    below10 = true;
                makeState(idnc+'fillPercent', l)
                    .then(res => makeState(idnc+'color',rgb))
                    .then(res => makeState(idnc+'text',ss))
                    .then(arg => res(arg),res(null));
            }))
        .then(arg => makeState(idn+'anyBelow10',below10))
        .then(arg =>  adapter.log.debug(`HP Printer inks found:${colors.length}`),
            err => adapter.log.debug(`HP Printer could not find info!`));
}


function scanAll() {
    if (isStopping) // do not start scan if stopping...
        return;
    
    adapter.log.debug(`Would now start scan for devices! ${printerCount===0 ? 'Would also scan for printer ink now!' :'printerCount='+printerCount}`);

    for (let item of scanList.values())
        item.ipHere = item.btHere = false;

    Promise.all([
        myNoble(scanDelay - 25000)
            .then(data => {
                let found = 0;
                for(let key of scanList.values()) {
                    if (data[key.bluetooth]) {
                        key.btHere = true;
                        ++found;
                    }
                }
                adapter.log.debug(`Noble found ${found} from returned ${Object.keys(data).length}:${_o(data)}`);
                return found;
            }, err => false),
        pSeries(scanList.values(), (item,obj,res,rej) => {
//            let item = obj[key];
            adapter.log.debug(`item ${_o(item)}`);
//            adapter.log.debug(`key ${key} obj ${_o(key)} = ${_o(obj[key])}`);
            let all = [];
            if (item.hasIP) 
                all.push((new Promise((res,rej) => 
                        ping.sys.probe(item.ip,alive => res(alive))))
                    .then(res => {
                        if (doFping)
                            return pExec('fping '+item.ip)
                                .then(stdout => / is alive/.test(stdout) || res,false)
                        res;
                    })
                    .then(ip => {
                        if (ip) {
                            item.ipHere = true;
                            if (item.printer && printerCount===0)
                                return scanHP(item);
                        }
                    })
                );
            
            if (doHci && item.hasBT && !item.bluetooth.startsWith('7c:2f:80')) 
                all.push(pExec('hcitool name ' + item.bluetooth)
                    .then(stdout => {
                        let bth = stdout > "";
                        if (bth) {
                            item.btname = stdout.trim();
                            item.btHere = true;
                        }
                        bth;
                    },err => false)
                    .then(bt => item.btHere = bt));               
            
            all.push(wait(100));
            Promise.all(all)
                .then(obj => res(item.name), 
                    err => res(`err in ${item.name}`));
        }).then(res => res, err => {adapter.log.debug(`err ${_o(err)}`); return 'err';})
    ]).then(res => {
//            adapter.log.debug(`Promise all  returned ${res}  ${res}:${_o(res)}`);
            if (++printerCount >=printerDelay)
                printerCount = 0;
            whoHere = [];
            for(let item of scanList.values()) {
                const here = item.ipHere || item.btHere;
                let cnt = item.cnt || -delayAway;
                let anw = false;
                if (here) {
                    cnt = cnt<0 ? 0 : cnt+1;
                    anw = true;
                } else {
                    cnt = cnt>0 ? -1 : cnt -1;
                    anw = cnt >= -delayAway;
                }
                if (anw && !item.name.endsWith('-'))
                    whoHere.push(item.name);
                item.anwesend = anw;
                item.cnt = cnt;
                const idn = item.id;
                makeState(idn+'.count',cnt)
                    .then(res => makeState(idn+'.here',anw))
                    .then(res => item.hasIP ? makeState(idn+'.ipHere',item.ipHere) : false)
                    .then(res => item.hasBT ? makeState(idn+'.btHere',item.btHere) : false);
            }
            countHere = whoHere.length;
            whoHere = whoHere.join(', ');
            return makeState('countHere',countHere)
                .then(res => makeState('whoHere',whoHere))
                .then(res => adapter.log.info(`${countHere} devices here: ${whoHere}`));
        }, err => adapter.log.warn(`Scan devices returned error: ${_o(err)}`));
}

function main() {
    host = adapter.host;

    try{
        noble = require('noble');
    } catch(e) {
        adapter.log.warn(`Noble not available, Error: ${_o(e)}`);
        noble = null;
    }


    if (!adapter.config.devices.length) {
        adapter.log.warn(`No to be scanned devices are configured for host ${host}! Will stop Adapter`);
        return stop(true);
    }

    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay)<30)
        adapter.config.scandelay = 30;
    scanDelay = adapter.config.scandelay * 1000;

    if (!adapter.config.delayaway || parseInt(adapter.config.delayaway)<2)
        adapter.config.delayaway = 2;
    delayAway = adapter.config.delayaway;

    if (!adapter.config.printerdelay || parseInt(adapter.config.printerdelay)<100)
        adapter.config.printerdelay = 100;
    printerDelay = adapter.config.printerdelay;

    adapter.log.info(`radar set to scan every ${adapter.config.scandelay} sec and printers every ${printerDelay} scans.`);

    pExec('!fping 127.0.0.1').then(stdout => / is alive/.test(stdout),false)
        .then(result => {
            doFping = result;
            return pExec('!hcitool name 12:34:56:78:90:ab');
        }).then(res => true, err =>  false)
        .then(res => {
            doHci = res;
            return pSeries(adapter.config.devices, (item,obj,res,rej) => {
                if (item.name)
                    item.name = item.name.trim();
                if (!item.name || item.name.length<2)
                    return process.nextTick(res,`Invalid item name '${_o(item.name)}', must be at least 2 letters long`);
                if (scanList.has(item.name))
                    return process.nextTick(res,`Double item name '${item.name}', names cannot be used more than once!`);
                item.id = item.name;
                item.ip = item.ip ? item.ip.trim() : '';
                item.bluetooth = item.bluetooth ? item.bluetooth.trim() : '';
                if (item.bluetooth!== '' && !/^..:..:..:..:..:..$/.test(item.bluetooth))
                    return process.nextTick(res,`Invalid bluetooth address '${item.bluetooth}', 6 hex numbers separated by ':'`);                
                item.printer =  item.ip && item.name.startsWith('HP-');
                item.hasIP = item.ip && item.ip.length>2;
                item.hasBT = item.bluetooth && item.bluetooth.length===17;
                if (!(item.hasIP || item.hasBT))
                    return process.nextTick(res,`Invalid Device should have IP or BT set ${_o(item)}`);                
                scanList.set(item.name,item);
                adapter.log.info(`Init item ${item.name} with ${_o(item)}`);
                process.nextTick(res,item);
            });
        }).then(res => {
            adapter.log.info(`radar adapter initialized ${scanList.size} devices.`);
            adapter.log.info(`radar set use of fping to ${doFping} and doHci to ${doHci}.`);
            scanTimer = setInterval(scanAll,scanDelay);
            scanAll(); // scan first time
        }).catch(err => {
            adapter.log.warn(`radar initialization finished with error ${_o(err)}, will stop adapter!`);
            stop(true);
        });
}
