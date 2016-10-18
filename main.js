/**
 *
 *      iobroker radar Adapter
 *
 *      (c) 2016- <frankjoke@hotmail.com>
 *
 *      MIT License
 *
 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";
const utils   =   require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter =   utils.adapter('radar');

const async =     require('async');
const util =      require('util');
const xml2js =    require('xml2js');
const request =   require('request');
const ping =      require('ping');
const noble =     require('noble');
const exec =      require('child_process').exec;

var isStopping =    false;
var scanList =      {};
var scanDelay =     30*1000; // in ms
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

adapter.on('message', function (obj) {
    if (obj) processMessage(obj);
    processMessages();
});

adapter.on('ready', function () {
    main();
});

adapter.on('unload', function () {
    stop(false);
});

function processMessage(obj) {
    if (!obj || !obj.command) return;
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

function processMessages() {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            processMessage(obj.command, obj.message);
            processMessages();
        }
    });
}

/* No state changes required!
// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    var lid = id.split('.').slice(2).join('.');
    var item = idList[lid];

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack && !(state['from'] && state['from'].endsWith('.rpi-gpio.'+adapter.instance))) {

        if (!item || item.direction=='Input')
            return adapter.log.warn(util.format('Invalid or read only item to change: %s, %j',lid,item));
        
        adapter.log.info('stateChange ' + id + ' to ' + util.inspect(state));
        gpio.write(item.pin,!!state.val, function(err,val) {
            if (err)
                adapter.log.warn(util.format('Error (%j) when writing to %s =%j',err,id,state));
        });
    }
});



function createState(item,callback) {
    var id = item.direction + '.' + item.name;
    var c = {
        type: 'state',
        common: {
            name:   id,
            type:   'boolean',
            read:   true,
            write:  item.direction === 'Output',
            role:   'switch',
            desc:   JSON.stringify(item)
        },
        native : {
            item:       item,
        }
    };
    item.id = id;
    idList[id] = item;
    adapter.setObject(id,c,function(err) {
        adapter.log.info(util.format('Created State %s with %j, err was %j',id,c,err));
        if (item.direction=='Input') {
            gpio.setup(item.pin,gpio.DIR_IN,gpio.EDGE_BOTH, function(err,val) {
                if(err)
                    return callback(err);
                gpio.read(item.pin, function(err,val) {
                    adapter.setState(item.id, { 
                        val: !!val, 
                        ack: true, 
                        ts: Date.now()
                    });             
                    return callback(err);
                });
            });
        } else {
            gpio.setup(item.pin,gpio.DIR_OUT,callback);
        }

    });
 
}

function handleInputs(channel, value) {
        var item = pinList[parseInt(channel)];
        if (!item || item.direction=='Output') {
            return adapter.log.warn('Invalid Channel ' + channel + ', No input dfined for it!');
        }
        adapter.log.info(util.format('Change %s to %j',item.id,value));
        adapter.setState(item.id, { 
            val: !!value, 
            ack: true, 
            ts: Date.now()
        });

}
*/

var nobleRunning = null;

function myNoble(len,callback) {
    var idf = {};
    if (nobleRunning) 
        clearTimeout(nobleRunning);
    nobleRunning = null;

    function stopNoble(idf) {
        if (nobleRunning)
            clearTimeout(nobleRunning);
        nobleRunning = null;
        noble.removeAllListeners('discover');
        noble.stopScanning();
//        adapter.log.debug(util.format('Noble found %j',idf));
        return idf;
    }
    
    if (isStopping)
        return callback("Stopping");
    
    if(noble.state !== 'poweredOn') 
        return callback('Noble not powered ON!');
        
    noble.on('discover', function(per){
        if (isStopping) 
            return stopNoble(idf);
        
        var idt = (per.advertisement && per.advertisement.localName )? per.advertisement.localName : "NaN";
        idf[per.address] = {
            address: per.address,
            name: idt,
            rssi: per.rssi
        };

    });
    noble.startScanning([], true);
    nobleRunning = setTimeout(function() {
        return callback(null,stopNoble(idf)); 
    }, len);
}

var doFping = true;
function scanFping(item,callback) {
    exec('fping ' + item.ip, function (error, stdout, stderr) {
        var here = false;
        if (error) {
//            logs('fping '+item.ip+' error: unreachable or fping not installed', 'debug2');
            return callback(null,false);
        } else {
            if (/ is alive/.test(stdout)) {
                here = item.ipHere = true;
//                adapter.log.debug(util.format('frping found %s alive!',item.id));            
            }
        }
        return callback(null,here);
    });            
}

var doHci = true;
function scanHci(item,callback) {
            if (!item.bluetooth || item.bluetooth.length<16) {
                item.btHere = false;
                return callback(null,false);
            }
            if (item.bluetooth.startsWith('7c:2f:80')) { // check if G-Tag
                return callback(null,false); // no need to scan G-Tag, will not work!
            }
                
            exec('hcitool name ' + item.bluetooth, function (error, stdout, stderr) {
//                logs('hcitool '+ item.bt + " = " + stdout, 'debug2');
                var bth = false;
                if (error) {
//                    logs('hcitool name '+item.bluetooth+' error: ' + error, 'debug2');
                    return callback(null,false);
                } else {
                    if (stdout > "") {
                        item.btname = stdout.trim();
                        bth = item.btHere = true;
                    }
                }
                return callback(null,bth);
            });
        }       

function scanHP(item,callback) {
    function parseNumbers(str) {
        if (!isNaN(str)) {
            str = str % 1 === 0 ? parseInt(str, 10) : parseFloat(str);
        }
        return str;
    }
    if (!item.ip || item.ip==='')
        return callback(null);
    request('http://'+item.ip+'/DevMgmt/ConsumableConfigDyn.xml', function (error, response, body) {
        if (error || response.statusCode != 200)
            return callback(null);
        var parser = new xml2js.Parser({explicitArray:false,valueProcessors:[parseNumbers]});
        parser.parseString(body, function(err,result){
            if (err) {
                return callback(null);
            } else {
                var po = result["ccdyn:ConsumableConfigDyn"]["ccdyn:ConsumableInfo"];
                var colors = [];
                if (Array.isArray(po)) 
                    for (var i in po) {
                        var item = po[i];
                        if (item["dd:ConsumableTypeEnum"]=="ink") {
                            var p = "P" + item["dd:ConsumableStation"],
                                lc = item["dd:ConsumableLabelCode"],
                                d = item["dd:Installation"]["dd:Date"],
                                l = item["dd:ConsumablePercentageLevelRemaining"],
                                ci = item["dd:ConsumableIcon"],
                                s = ci["dd:Shape"],
                                fc = ci["dd:FillColor"],
                                rgb = fc["dd:Blue"] | (fc["dd:Green"] << 8) | (fc["dd:Red"] << 16),
                                n = item["dd:ConsumableSelectibilityNumber"],
                                rgb = '#' + (0x1000000 + rgb).toString(16).slice(1),
                                ss = util.format("%s = %s, %s, %d%%, %s, %s, %s",p, lc, d, l, n, rgb, s);
/*
                            var cf = getState(idn(lc+".fillPercent"));
                            if (!cf.val) { 
                                logs(idn(lc+".fillPercent"),"debug1");
                                createState(idn(lc+".fillPercent"),l);
                                createState(idn(lc+".color"),rgb);
                                createState(idn(lc+".text"), ss);
                            } else {
                                setState(instanz+idn(lc+".fillPercent"),l);
                                setState(instanz+idn(lc+".color"),rgb);
                                setState(instanz+idn(lc+".text"), ss);
                            }
*/
//                                logj("Color text",getState(instanz+idn(lc+".text")));
                            colors.push(ss);
                        }
                    }
                adapter.log.debug(util.format('HP Printer iks found:%j',colors));
                callback(null);
            } 
        });
    });
}

function scanAll() {
    if (isStopping) // do not start scan if stopping...
        return;
    
    adapter.log.debug(util.format('Would now start scan for devices! printerCount=%d',printerCount));
    if (printerCount===0) {
        adapter.log.debug(util.format('Would also scan for printer ink'));    
    }

    for(var key in scanList) {
        scanList[key].ipHere = false;
        scanList[key].btHere = false;
    }

    async.parallel([
        function(callbp) {
            myNoble(scanDelay - 10000, function(err,data) {
                if (err)
                    return callb(err);
                adapter.log.debug(util.format('Noble returned %d items:%j',Object.keys(data).length,data));
                var found = 0;
                for(var key in scanList) 
                    if (data[scanList[key].bluetooth]) {
                        scanList[key].btHere = true;
                        ++found;
                    }
                adapter.log.debug(util.format('Noble found %d items from scanList.',found));
                callbp(null);                
            });
        },
        function(callbp) {
            async.eachSeries(scanList, function(item,callbs) {
                async.parallel([
                    function (callbp2) {  // handle ping call
                        if(!item.ip || item.ip==='')
                            return callbp2(null,false);
                        ping.sys.probe(item.ip,function (alive) {
                            if (alive)
                                item.ipHere = true;
//                            adapter.log.debug(util.format('ping found',item.id,alive));
                            callbp2(null,alive);
                        });
                    },
                    function(callbp2) {  // Try fping
                        if(doFping && item.ip && item.ip!=='')
                            scanFping(item,callbp2);
                        else
                            callbp2(null,false);
                    }, 
                    function(callbp2) { // Try BT Hci
                        if(doHci)
                            scanHci(item,callbp2);
                        else
                            callbp2(null,false);
                    }
                ],function(err,res) {
//                    adapter.log.debug(util.format('TestParallel %s returned %j, %j, %d',item.name,res,item,printerCount));
                    if(item.ipHere && item.printer && printerCount===0)
                        scanHP(item,callbs);
                    else
                        callbs(err,item.name);
                });
            },callbp);
        }
    ], function(err,result)  {
        if (++printerCount >=printerDelay)
            printerCount = 0;
        if (err)
            return adapter.log.warn(util.format('Scan devices returned error: %j',err));
        whoHere = [];
        for(var key in scanList) {
            var item = scanList[key];
            var here = item.ipHere || item.btHere;
            var cnt = item.cnt || 0;
            var anw = !!item.anwesend;
            if (here) {
                if(cnt<0)
                    cnt = 0;
                else 
                    ++cnt;
                anw = true;
            } else {
                if(cnt>0)
                    cnt = 0;
                --cnt;
                if (-cnt>=delayAway)
                    anw = false;
            }
            if (anw)
                whoHere.push(item.name);
            item.anwesend = anw;
            item.cnt = cnt;
//            adapter.log.debug(util.format('Item %s has state:',key,item));
        }
        countHere = whoHere.length;
        adapter.log.info(util.format('%d devices here: %j',countHere,whoHere));
    })

}

function main() {
    host = adapter.host;

    if (!adapter.config.devices.length) {
        adapter.log.warn(util.format('No to be scanned devices are configured for host %s! Will stop Adapter',host));
        stop(true);
        return;
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

    adapter.log.info(util.format('radar set to scan every %d sec and printers every %d scans.' ,adapter.config.scandelay,printerDelay));
    
    async.series([
        function (callb) {
            scanFping({ip:'127.0.0.1'},function(err,here) {
                if(!err)
                    doFping = here;
                callb(null,here);
            });
        },
        function (callb) {
            scanHci({bluetooth:'12:34:56:78:90:ab'}, function(err,here) {
                doHci = !err;
                callb(null,doHci);
            });
        },
        function(callb) {
            async.eachSeries(adapter.config.devices, function(item,callback) {
                    adapter.log.info(util.format('Init item %j',item));
                    if (item.name)
                        item.name = item.name.trim();
                    if (!item.name || item.name.length<2)
                        return callback(util.format("Invalid item name '%j', must be at least 2 letters long",item.name));
                    if (scanList[item.name])
                        return callback(util.format("Double item name '%s', names cannot be used more than once!", item.name));
                    item.id = 'Scan.' + item.name;
                    item.ip = item.ip ? item.ip.trim() : '';
                    item.bluetooth = item.bluetooth ? item.bluetooth.trim() : '';
                    if (item.bluetooth!== '' && !/^..:..:..:..:..:..$/.test(item.bluetooth))
                        return callback(util.format("Invalid blöoutooth address '%s', 6 hex numbers separated by ':'",item.bluetooth));                
                    if (item.name.startsWith('HP-') && item.ip.length>1)
                        item.printer = true;
                    scanList[item.name] = item;
                    adapter.log.info(util.format('Init item %s with %j',item.name,item));
                    callback();  // for test...
        //            createState(item,callback);
            },function(err){
                if (err)
                    return callb(err);
                adapter.log.info(util.format('Rpi radar adapter initialized %d devices %j',Object.keys(scanList).length,Object.keys(scanList)));
        //        adapter.subscribeStates('*'); // subscribe to states only now
                callb(null,scanList);
            });
        }

    ], function(err,result) {
        if (err) {
            adapter.log.warn(util.format('radar initialization finished with error %j, will stop adapter!' ,err));
            stop(true);
        }
        adapter.log.debug(util.format('radar initialization finished with results %j' ,result));
        adapter.log.info(util.format('radar set use of fping to %s and hci to %s' ,doFping,doHci));
        scanAll(); // scan first time
        scanTimer = setInterval(scanAll,scanDelay);
    })

//    if (adapter.config.interval < 5000) adapter.config.interval = 5000;

}

