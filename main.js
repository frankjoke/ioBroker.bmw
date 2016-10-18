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
var utils   =   require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter =   utils.adapter('radar');

var async =     require('async');
var util =      require('util');

var isStopping = false;

function stop() {
    isStopping = true;
    gpio.removeAllListeners();
    gpio.destroy();
    adapter.log.warn('Adapter disconnected and stopped');
} 

adapter.on('message', function (obj) {
    if (obj) processMessage(obj);
    processMessages();
});

adapter.on('ready', function () {
    main();
});

adapter.on('unload', function () {
    stop();
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

var ioList = {};
var idList = {};
var pinList = {};
var host = null;


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

function main() {
    host = adapter.host;

    if (!adapter.config.devices.length) {
        adapter.log.warn('No GPIO pins are configured! Will stop Adapter');
        stop();
        return;
    }

    if (adapter.config.bcmmode) {
        adapter.log.info('BCM Pin numbering mode enabled');        
    }

//    if (adapter.config.interval < 5000) adapter.config.interval = 5000;

    async.eachSeries(adapter.config.devices, function(item,callback) {
            adapter.log.info(util.format('Init item %s',util.inspect(item)));
            if (item.name)
                item.name = item.name.trim();
            if (!item.name || item.name.length<2)
                return callback(util.format("Invalid item name '%j', must be at least 2 letters long",item.name));
            if (ioList[item.name])
                return callback(util.format("Double item name '%s', names cannot be used more than once!", item.name));
            var pin = parseInt(item.pin);
            if (pinList[pin]) {
                    return callback(util.format("Double pin number '%d', pin numbers can be used only once!", pin));
                }
            item.pin = pin;
            var dir = item.direction.trim().toLowerCase();
            if (['output','ausgang','out'].indexOf(dir)>=0 || dir.startsWith('o'))
                dir = 'Output';
            else
                dir = 'Input';
            item.direction = dir;
            ioList[item.name] = item;
            pinList[pin] = item;
            adapter.log.info(util.format('Init item %s',util.inspect(item)));
            createState(item,callback);
    },function(err){
        if(err) {
            adapter.log.warn(util.format('Rpi GPIO adapter initialize error %j',err));
            return stop();
        }
        adapter.log.info(util.format('Rpi GPIO adapter initialized %d pins %j',Object.keys(ioList).length,pinList));
        adapter.subscribeStates('*'); // subscribe to states only now
        gpio.on('change', handleInputs); // subscribe to input changes
    });
}

