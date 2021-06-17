const webServer = require('./services/webserver.service');
const database = require('./services/database.service');
// *** line that requires services/web-server.js is here ***
const dbConfig = require('./config/database.config');
const defaultThreadPoolSize = 4;

// Increase thread pool size by poolMax
process.env.UV_THREADPOOL_SIZE = dbConfig.sharding.poolMax + defaultThreadPoolSize;

async function startup() {
    console.log('Starting application');

    //Wait panel
    var P = ["\\", "|", "/", "-"];
    var x = 0;
    let myInterval = setInterval(function() {
        process.stdout.write("\r" + P[x++]);
        x &= 3;
      }, 250);



    try {
        console.log('Initializing web server module');

        await webServer.initialize();
        console.log("Web server started");
    } catch (err) {
        console.error(err);

        process.exit(1); // Non-zero failure code
    }

    try {
        console.log('Initializing database module');

        await database.initialize();
        console.log("Database connected");
    } catch (err) {
        console.error(err);

        process.exit(1); // Non-zero failure code
    }
 


    clearInterval(myInterval);
}

startup();

async function shutdown(e) {
    let err = e;

    console.log('Shutting down');

    try {
        console.log('Closing web server module');

        await webServer.close();

    } catch (e) {
        console.log('Encountered error', e);

        err = err || e;
    }

    try {
        console.log('Closing database module');

        await database.close();

    } catch (e) {
        console.log('Encountered error', e);

        err = err || e;
    }


    console.log('Exiting process');

    if (err) {
        process.exit(1); // Non-zero failure code
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => {
    console.log('Received SIGTERM');

    shutdown();
});

process.on('SIGINT', () => {
    console.log('Received SIGINT');

    shutdown();
});

process.on('uncaughtException', err => {
    console.log('Uncaught exception');
    console.error(err);

    shutdown(err);
});