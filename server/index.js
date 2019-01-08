const express = require('express');
const path = require('path');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
let mysql = require('mysql');
var firebase = require("firebase");

const PORT = process.env.PORT || 5000;

const {google} = require('googleapis');
const bodyParser = require('body-parser')
const stringify = require('json-stringify-safe');


//GMAIL API CREDENTIALS
const CREDENTIALS = {
    "client_id": "*************.apps.googleusercontent.com", // example
    "project_id": "",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://www.googleapis.com/oauth2/v3/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "",
    "redirect_uris": ["http://localhost:5000"], //example
    "javascript_origins": ["http://localhost:3000"] //example
}

let pool = mysql.createPool({
    connectionLimit: 30,
    host: "",
    user: "",
    password: "",
    database: ""
});

var firebaseConfig = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: ""
};
firebase.initializeApp(firebaseConfig);

const {client_secret, client_id, redirect_uris} = CREDENTIALS;

let clientIndex = 0;
let oAuth2Client = []

function authorize(credentials, callback, userToken, res) {

    oAuth2Client[clientIndex] = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    return getNewToken(oAuth2Client[clientIndex], callback, userToken, res);
}

function getNewToken(oAuth2Client, callback, userToken, res) {
    clientIndex++
    return oAuth2Client.getToken(userToken, (err, token) => {
        oAuth2Client.setCredentials(token);

        return callback(oAuth2Client, res);
    });
}

function getAllEmailPayload(data, auth, response, emailAddress) {
    const gmail = google.gmail({version: 'v1', auth})
    let emailsData = []
    let dataLength = data.length
    let activeData = 0

    console.log('getting email payload...', data)
    let getEmails = function (request) {
        request.then(function (resp) {

            emailsData.push(resp.data);

            if (activeData < dataLength - 1 && data[activeData] && data[activeData].id) {
                ++activeData

                let labelIds = ""
                if (resp.data.labelIds.length) {
                    resp.data.labelIds.forEach((label) => {
                        labelIds += labelIds === "" ? label : `, ${label}`
                    })
                }
                let sql = `INSERT INTO candidate_emails (owner_email,email_id,raw) VALUES ('${emailAddress}','${resp.data.id}','${JSON.stringify(resp.data)}')`;

                pool.query(sql, function (error, results, fields) {
                    if (error) return true;
                    firebase.database().ref('emails').update({
                        [emailAddress.replace(/[&\/\\#,+@()$~%.'":*?<>{}]/g, '_')]: {
                            progress: `${activeData}/${dataLength}`,
                            emailAddress
                        }
                    })
                });

                request = gmail.users.messages.get({
                    'userId': 'me',
                    'id': data[activeData].id,
                    'format': 'raw'
                });
                getEmails(request);
            } else {

                firebase.database().ref('emails').update({
                    [emailAddress.replace(/[&\/\\#,+@()$~%.'":*?<>{}]/g, '_')]: {
                        progress: `completed`,
                        emailAddress
                    }
                })

            }
        });
    };
    let initialRequest = gmail.users.messages.get({
        'userId': 'me',
        'id': data[0].id,
        'format': 'raw'
    })

    getEmails(initialRequest);
}

function getAllEmail(auth, response) {
    const gmail = google.gmail({version: 'v1', auth});
    let data = []

    let getPageOfMessages = function (request) {
        request.then(function (resp) {
            if (data.length === 0) {
                data = resp.data.messages
            } else {
                data.push.apply(data, resp.data.messages);
            }

            let nextPageToken = resp.data.nextPageToken;
            if (nextPageToken) {
                request = gmail.users.messages.list({
                    'userId': 'me',
                    'pageToken': nextPageToken,
                });
                getPageOfMessages(request);

                console.log("EMAIL IDS LENGTH:", data.length)
            } else {

                gmail.users.getProfile({
                    'userId': 'me'
                }).then((res) => {

                    getAllEmailPayload(data, auth, response, res.data.emailAddress)

                })


            }
        });
    };
    let initialRequest = gmail.users.messages.list({
        'userId': 'me',
    });


    getPageOfMessages(initialRequest);

}


// Multi-process to utilize all CPU cores.
if (cluster.isMaster) {
    console.error(`Node cluster master ${process.pid} is running`);

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.error(`Node cluster worker ${worker.process.pid} exited: code ${code}, signal ${signal}`);
    });

} else {
    const app = express();

    // Priority serve any static files.
    app.use(express.static(path.resolve(__dirname, '../client/build')));
    app.use(function (req, res, next) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
        res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");

        next()
    })

    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({extended: false}))
    // Answer API requests.
    app.get('/api', function (req, res) {
        res.set('Content-Type', 'application/json');
        res.send('{"message":"Hello from the custom server!"}');
    });

    app.get('/getAuthUrl', function (req, res, next) {
        oAuth2Client[clientIndex] = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        const scopes = [
            'https://mail.google.com/',
        ];

        const url = oAuth2Client[clientIndex].generateAuthUrl({
            access_type: 'offline',
            scope: scopes
        });

        clientIndex++;

        res.send({url})
    });

    app.get('/getAllEmails/:token', (req, res, next) => {
        req.setTimeout(100000);
        const userToken = req.params.token
        console.log('TRIGGERED GET ALL EMAILS')

        res.send({res: true})

        authorize(CREDENTIALS, getAllEmail, userToken, res);

    })

    app.get('*', function (request, response) {
        response.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
    });

    app.listen(PORT, function () {
        console.error(`Node cluster worker ${process.pid}: listening on port ${PORT}`);
    });
}








