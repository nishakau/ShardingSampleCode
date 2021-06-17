const express = require("express");
const http = require("http");
const webConfigProp = require("../config/webserver.config");
const databseConfig = require("../config/database.config");
// const morgan = require('morgan');
const database = require("./database.service");


const cors = require("cors");
const cookieParser = require('cookie-parser');
const path = require("path");
const bodyParser = require("body-parser");

//SESSION RELATED STUFF
const session = require("express-session");
const { response } = require("express");
const MemoryStore = require('memorystore')(session);

// var oracleDbStore = require('express-oracle-session')(session);
// var sessionStore = new oracleDbStore(databseConfig.sharding);

let httpServer;

async function initialize() {
    return new Promise((resolve, reject) => {
        const app = express();
        httpServer = http.createServer(app);

    
        //Set view engine & point a view folder.

        app.set('view engine', 'ejs');
        app.set('views', 'views');
        app.engine('html', require('ejs').renderFile);

        // app.use(morgan('combined'));
      
        
        app.use(cors());

        app.use(cookieParser());
        app.use(session({
            key: 'user_id',
            secret: 'krehcerghgqawjh',
            resave: false,
            saveUninitialized: false,
            rolling:true,
            cookie: {
                path:'/',
                httpOnly:true,
                secure:false,
                maxAge: 3000*1000
            },
            store: new MemoryStore({
                checkPeriod: 86400000 // prune expired entries every 24h
            }),
            // store:sessionStore
        }));
        //ENDS HERE
        app.disable('view cache');
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({
            extended:true
        }));

        
        app.use((req, res, next) => {
                if (req.cookies.user_id && !req.session.user) {
                    res.clearCookie('user_id');
         
                }
                // res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                next();
        });


        /**All public files here */
        app.use('/bstrap',express.static(path.join(__dirname,'../node_modules/bootstrap/dist/')));
        app.use('/jquery',express.static(path.join(__dirname,'../node_modules/jquery/dist')));
        app.use('/chart',express.static(path.join(__dirname,'../node_modules/chart.js/dist')));
        app.use('/echart',express.static(path.join(__dirname,'../node_modules/echarts/dist')));
        app.use('/public',express.static(path.join(__dirname,'../public')));
    
        /**Ends here */

        /**All routes here */

        app.get("/",(request,response,next)=>{
            database.getFiveTrendingProducts().then(
                (res)=>{
                    // console.log(res);
                    response.render("index",{topfive:res});
                    response.end();
                },
                (err)=>{
                    return next(err);
                }
            )
           
        })

        app.get("/login",(request,response,next)=>{
            response.render("login");
            response.end();
        })
        
        require("../routes/main.route")(app);

        const userRoute = require("../routes/user.route");
        app.use("/user",userRoute);
        
        require("../routes/admin.route")(app);
        /**Routes ends here */



        app.use(function (req, res, next) {
            var err = new Error("File not found");
            err.status = 404;
            next(err);
          });
      
          app.use(function (err, req, res, next) {
            res.status(err.status || 500);
            res.send(err.message);
            res.end();
          });


        httpServer.listen(webConfigProp.port)
            .on('listening', () => {
                console.log(`web server listening on the port :${webConfigProp.port}`);
                resolve();
            })
            .on('error', (err) => {
                reject(err);
            });
    });
}

module.exports.initialize = initialize;


module.exports.close = function close() {
    return new Promise((resolve, reject) => {
        httpServer.close((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}
