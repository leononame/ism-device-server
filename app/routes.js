'use strict';
// app/routes.js

module.exports = function(app, validator, xss, fs) {
  app.get('/shutdown', (req, res) => {
    res.render('shutdown', {
      pagetitle: "Shutdown",
      message: "Server is shut down."
    });
    // process.exit();
  });
  app.get('/shutdown/yes', (req, res) => {
    process.exit();
  });
  // =================================================
  // =================================================
  // HOME PAGE
  // =================================================
  // =================================================
  app.get('/', function(req, res) {
    res.render('home', {
      pagetitle: 'Home'
    });
  });
  app.get('/home', function(req, res) {
    res.redirect('/');
  });
  // =================================================
  // =================================================
  // ABOUT PAGE
  // =================================================
  // =================================================
  app.get('/about', function(req, res) {
    res.render('about', {
      pagetitle: 'About'
    });
  });
  // =================================================
  // =================================================
  // CONFIG PAGE
  // =================================================
  // =================================================
  // -------------------------------------------------
  // BASIC config page
  // -------------------------------------------------
  app.get('/configuration', function(req, res) {
    res.render('configuration', {
      pagetitle: 'Configuration',
      url: 'https://ismportal.azurewebsites.net'
    });
  });
  // POST
  // URL is defined
  app.post('/configuration', function(req, res) {
    // XSS protection
    var url = xss(req.body.portalurl);
    // If URL isn't valid, ask user to use correct URL
    if (!validator.isURL(url)) {
      return res.render('configuration', {
        pagetitle: 'Configuration',
        error: 'Please specify a correct URL',
        url: url
      });
    }

    // URL is valid
    var request = require('request');
    // Add API to URL
    var apiUrl = url + '/api/newdevice';
    // Make request to API to get Locations
    request.get({
        url: apiUrl,
        json: true
      }, (err, resp, data) => {
        // An error occured
        if (err) {
          console.log('Error:', err);
          return res.render('err', {
            message: 'An error occured trying to contact the server.',
            pagetitle: 'Configuration'
          });
        // Something bad has happened
        } else if (res.statusCode !== 200) {
          console.log('Status:', res.statusCode);
          return res.render('err', {
            message: "Error. The server API doesn't work as expected",
            pagetitle: 'Configuration'
          });
        // Everything OK
        } else {
          // data is already parsed as JSON
          return res.render('configuration_complete', {
            pagetitle: 'Configuration',
            portalurl: url,
            data: data,
            error: req.flash('nameError'),
            urlMessage: req.flash('urlError'),
            inName:req.body.name
          });
        }
    });
  })

  app.post('/configuration/done', function(req, res){
    // XSS protection
    var url = xss(req.body.portalurl);
    var sw = xss(req.body.software);
    var hw = xss(req.body.hardware);
    var loc = xss(req.body.location);
    var nm = xss(req.body.name);

    // Only alphanumerical  characters allowed
    var r = /^[\w]+$/
    // If no name has been specified or name invalid
    if (nm.length == 0 || !nm.match(r)) {
      // Make a 307 redirect
      // That means make same post request again
      req.flash('nameError', 'Please specify a name. Only alphanumerical characters and underscore allowed.')
      return res.redirect(307, '/configuration');
    }

    // Ok, if nobody is tampering with our website, we're good to go
    // Just double check URL
    if (!validator.isURL(url)) {
      req.flash('urlError', 'Incorrect URL format.')
      return res.redirect(307, '/configuration');
    }
    // This only applies if someone actively tries to edit the POST data since it's from select fields
    if (isNaN(sw) || isNaN(hw) || isNaN(loc)) {
      return res.redirect(307, '/configuration');
    }

    // We're good
    // Make the request to the api
    var request = require('request');
    // Add API to URL
    var apiUrl = url + '/api/newdevice/' + nm + '?sw=' + sw + '&hw=' + hw + '&loc=' + loc;
    // Make request to API to get Locations
    request.get({
        url: apiUrl,
        json: true
      }, (err, resp, data) => {
        // An error occured
        if (err) {
          console.log('Error:', err);
          return res.render('err', {
            message: 'An error occured trying to contact the server.',
            pagetitle: 'Configuration'
          });
        // Something bad has happened
        } else if (res.statusCode !== 200) {
          console.log('Status:', res.statusCode);
          return res.render('err', {
            message: "Error. The server API doesn't work as expected",
            pagetitle: 'Configuration'
          });
        // Everything OK
        } else {
          // Oh no, an error in the request
          if (data.Error) {
            if (data.Error === "This device ID is already taken.") {
              req.flash('nameError', data.Error);
              return res.redirect(307, '/configuration');
            }
            return res.render("err", {
              message: "An unexpected error has occured.",
              pagetitle: 'Configuration'
            });
          }

          // Encrypt password
          var exec = require('child_process').exec;
          var cmd = 'deh -en password "' + data.Password + '"';
          exec(cmd, function(error, stdout, stderr) {
            if (/Tpm is defending against dictionary attacks/.test(stdout)) {
              cmd = 'tpm_resetdalock -z';
              exec(cmd, function(error, stdout, stderr) {
                res.render('err', {
                  message: "Error. The device encryption module is in lockdown mode because it is protecting itself against dictionary attacks. We will reset it. Please restart configuration. If this error persists, you might be under attack.",
                  pagetitle: 'Configuration'
                });
              });
            } else {
              // data is already parsed as JSON
              var config = {
                name: nm,
                url: url,
                sw: sw,
                hw: hw,
                loc: loc,
                code: data.Code,
                status: "Approval pending"
              }
              fs.writeFile("config.json", JSON.stringify( config ), "utf8" );
              res.render('status', {
                pagetitle: 'Configuration',
                code: data.Code,
                name: data.Id,
                status: config.status,
                type: 'conf'
              });
            }
          }); // Exec deh
        }
    });
  });

  // =================================================
  // =================================================
  // STATUS PAGE
  // =================================================
  // =================================================
  app.get('/status', function(req, res) {
    fs.readFile('config.json', (err, data) => {
      if (err) {
        return res.render('err', {
          message: 'Please configure the device.',
          pagetitle: "Status"
        });
      }
      var status = JSON.parse(data);
      if (status.code === undefined || status.name === undefined) {
        return res.render('err', {
          message: 'Please configure the device.',
          pagetitle: "Status"
        });
      }
      res.render('status',{
        type: 'status',
        code: status.code,
        name: status.name,
        status: status.status,
        pagetitle: 'Status',
        message: req.flash('statusmessage'),
        error: req.flash('statuserror'),
        success: req.flash('statussuccess'),
      });
    });
  });


  // =================================================
  // =================================================
  // CHECK APPROVAL PAGE
  // =================================================
  // =================================================
  app.post('/status', (req, res) => {
    fs.readFile('config.json', (err, config) => {
      if (err) {
        return res.render('err', {
          message: 'Device not configured.',
          pagetitle: 'Error'
        });
      } // if (err)
      var configData = JSON.parse(config);
      if (configData.status === 'Approved') {
        return res.redirect('/status');
      }


      // Decrypt password
      var exec = require('child_process').exec;
      var cmd = 'deh -dn password';
      exec(cmd, function(error, stdout, stderr) {
        if (error) {
          cmd = 'tpm_resetdalock -z';
          exec(cmd, function(error, stdout, stderr) {
            res.render('err', {
              message: "Error. The device encryption module is in lockdown mode because it is protecting itself against dictionary attacks. We will reset it. Please restart configuration. If this error persists, you might be under attack.",
              pagetitle: 'Configuration'
            });
          });
        } else {
          // Ok, everything is good. Now, let's make the request.
          var apiUrl = configData.url + '/api/newdevice/' + configData.name + '?code=' + configData.code + '&password=' + encodeURIComponent(stdout.replace(/[\n\t\r]/g,""));
          var request = require('request');
          request.get({
              url: apiUrl,
              json: true
            }, (err, resp, data) => {
              // An error occured
              if (err) {
                console.log('Error:', err);
                return res.render('err', {
                  message: 'An error occured trying to contact the server.',
                  pagetitle: 'Configuration'
                });
              // Something bad has happened
              } else if (res.statusCode !== 200) {
                console.log('Status:', res.statusCode);
                return res.render('err', {
                  message: "Error. The server API doesn't work as expected",
                  pagetitle: 'Configuration'
                });
              // Everything OK
              } else {
                // Oh no, an error in the request
                if (data.Error) {
                  console.log(data.Error);
                  if (data.Error === "Device does not exist.") {
                    configData.status = "Denied";
                    fs.writeFile('config.json', JSON.stringify(configData), 'utf8');
                    req.flash("statuserror", "Device was rejected from portal.")
                    return res.redirect('/status');
                  }
                  req.flash("statusmessage", "Device is not approved yet. Please approve the device and double-check the verification code.")
                  return res.redirect('/status');
                }
                // Encrypt secret
                var exec = require('child_process').exec;
                var cmd = 'deh -e -n connectionstring ' + data.Key;
                exec(cmd, function(error, stdout, stderr) {
                  // command output is in stdout
                });
                configData.status = "Approved";
                fs.writeFile('config.json', JSON.stringify(configData), 'utf8');
                req.flash('statussuccess', 'Device has been approved.')
                res.redirect('/status');
              } // else (everything ok)
          }); // request.get
        } // if(error), else
      }); // exec()
    }); // fs.readFile
  }); // app.get

};
