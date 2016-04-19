"use strict";
const http       = require('http'),
    fs           = require('fs'),
    path         = require('path'),
    contentTypes = require('./utils/content-types'),
    sysInfo      = require('./utils/sys-info'),
    env          = process.env,
    phantom      = require('phantom');




var phInstance = null;

function createPhantomInstace(cb){
    phantom.create()
        .then(instance => {
            phInstance = instance;
            if (cb){
                cb(phInstance);
            }
        });
}

function getHtmlFromUrl(site_url, res){
    var sitepage = null;
    phInstance.createPage()
        .then(page => {
            sitepage = page;
            return page.open(site_url);
        })
        .then(status => {
            console.log('STATUS = '+status);
            var content = sitepage.property('content');
            content.then(
                obj =>{
                    console.log(obj);
                    res.setHeader('Content-Type', 'text/html');
                    res.write(obj);
                    return res.end();
                }
            );
        })
        .catch(error => {
            console.log('ERROR = '+error);
            res.write('');
            return res.end();
        });
}


createPhantomInstace();







let server = http.createServer(function (req, res) {
    let url = req.url;
    if (url == '/') {
        url += 'index.html';
    }

    if (url.startsWith('/render')){
        var site_url = url.split('$$$$')[1];
        console.log('In render');
        try{
            getHtmlFromUrl(site_url,res);
        }
        catch(e){
            console.log('Rerun phantomJS');
            createPhantomInstace(
                function(){
                    getHtmlFromUrl(site_url,res)
                }
            );
        }
        return;
    }
    // IMPORTANT: Your application HAS to respond to GET /health with status 200
    //                        for OpenShift health monitoring
    if (url == '/health') {
        res.writeHead(200);
        res.end();
    } else if (url.indexOf('/info/') == 0) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.end(JSON.stringify(sysInfo[url.slice(6)]()));
    } else {
        fs.readFile('./static' + url, function (err, data) {
            if (err) {
                res.writeHead(404);
                res.end();
            } else {
                let ext = path.extname(url).slice(1);
                res.setHeader('Content-Type', contentTypes[ext]);
                if (ext === 'html') {
                    res.setHeader('Cache-Control', 'no-cache, no-store');
                }
                res.end(data);
            }
        });
    }
});

server.listen(env.NODE_PORT || 3000, env.NODE_IP || 'localhost', function () {
    console.log(`Application worker ${process.pid} started...`);
});
