'use strict';
var helper = require('./helper');
var mqtt = require('mqtt');
var EventEmitter = require('events');
var emailService = require('../service/emailService');
var schedule = require('node-schedule');
var redis = require('redis');
var client = redis.createClient();
var clientMqtt = mqtt.connect('mqtt://broker.hivemq.com');

module.exports = function(Company) {
 helper(Company,[]);
 client.on('connect', function() {
    console.log('redis server connected');
  });

  var enumObject = Company.definition.rawProperties.weeklyOff.enum;

  Company.config = function(cb){
    var weeklyOff = {
      weeklyOffData : enumObject
    }
    var result = {
      status : true,
      "message" : "success",
      data : weeklyOff
    }
    cb(null,weeklyOff);
  };

  Company.addCompany = function(companyObject,cb) {
    var startDate = companyObject.startDate;
    var date = new Date(startDate);
    var teckStack = companyObject.teckStack;
    var shortName = companyObject.shortName;
    var newDate = date.getDate()+"-"+date.getMonth()+"-"+date.getFullYear();
    companyObject.batchName = shortName+"_"+teckStack+"_"+newDate;
    companyObject.save(function(err,doc){
      try{
        if(err) throw err;
        var result = {
          status : 'successfull',
          company : companyObject,
          message : 'Company added successfully'
        }
        client.hmset('hellocompany',companyObject.id,JSON.stringify({
          startTime : companyObject.startTime,
          endTime : companyObject.endTime,
          date : companyObject.startDate
        }));
        cb(null,result);
      }catch(e){
        console.error(err);
      }
    });
  }

  Company.observe('after save', function(ctx, next) {
    var email = ctx.instance.email;
    var event = new EventEmitter();
    event.on('email', () => {
      console.log('Sending email');
      emailService.emailService(email);
    });

    if(ctx.instance.isDeleted == false && ctx.isNewInstance == true ) {
    var startTime = ctx.instance.startTime.split(/:| /);
    var startHour = startTime[0];
    var startMinute = startTime[1];
    // event.emit('email');
    // console.log('Email Sent');
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [0, new schedule.Range(1 , 6)];
    rule.hour = startHour;
    rule.minute = startMinute;
    var j = schedule.scheduleJob(rule,function() {
      clientMqtt.publish()
    });

    var rule1 = new schedule.RecurrenceRule();
    rule1.dayOfWeek = [0, new schedule.Range(1 , 6)];
    var endTime = ctx.instance.endTime.split(/:| /);
    var endHour = endTime[0];
    var endMinute = endTime[1];
    rule1.hour = endHour;
    rule1.minute = endMinute;
    var j = schedule.scheduleJob(rule1,function() {
      console.log("Its Closing Time!!!");
    });
  }
  else {
    console.log('Data Not Saved SuccessFully');
  }
  next();
});

  Company.softDelete = function(companyName,cb){
    Company.find({where : { name : companyName }},function(err,doc){
      try{
            if(err) throw err;
            if(doc.length < 1){
              return cb(null,null)
            }
            let companyDoc  = doc[0];
            companyDoc.isDeleted = true;
            companyDoc.save(function(err,result) {
              if(err) throw err;
              cb(null,result);
            });
      }catch(e){
        console.error(e);
      }
    });
  }

   Company.findAllCompanies = function(cb){
     client.hgetall('hellocompany',function(err,doc) {
       var array = [];
       for(var i in doc) {
          array.push(JSON.parse(doc[i]));
       }
       // console.log(doc);
       cb(null,array);
     });
     // Company.find(function(err,result){
     //   try{
     //     if(err) throw err;
     //     var response = {
     //       status : "successfull",
     //       data : result,
     //       message : "Fetched all company details"
     //     }
     //     cb(null,response);
     //   }catch(e){
     //     console.error(e);
     //   }
     // });
   }

   Company.remoteMethod('findAllCompanies',{
     http : {
        path : '/findAllCompanies',
        verb : 'get',
        status : 200
      },
      returns: {
        arg : 'data',
        root : true
      }
   });
   Company.remoteMethod('addCompany',{
     http : {
        path : '/addCompany',
        verb : 'post',
        source : 'body',
        status : 200
      },
      returns: {
        arg : 'data',
        root : true
      },
      accepts : {
        arg  : 'companyDetails',
        type:"company",
        http:{
          "source":"body"
        }
      }
   });

  Company.remoteMethod('config',{
    http : {
       path : '/configWeekOff',
       verb : 'get',
       status : 200
     },
     returns: {
       arg : 'data',
       root : true
     }
  });
   Company.remoteMethod('softDelete',{
     http : {
        path : '/delete',
        verb : 'post',
        status : 200
      },
      returns: {
        arg : 'data',
        root : true
      },
      accepts : {
        arg : 'companyName',
        type : 'string'
      }
   });
};
