"use strict";
var builder = require("botbuilder");
var Promise = require('bluebird');
var fs = require('fs');
var needle = require('needle')
var url = require('url');
var btoa = require('btoa');
var requestApi = require('request');
var botbuilder_azure = require("botbuilder-azure");
var spellService = require('./services/spell-service');
var speechService = require('./services/speech-service');
var speakeasy = require('speakeasy');

const states = ['MN']; //add all states later on.
const visionApiUrl = process.env['VisionURL'] + process.env['VisionAPIKey'];
const luisAppId = process.env.LuisAppId;
const luisAPIKey = process.env.LuisAPIKey;
const luisAPIHostName = process.env.LuisAPIHostName || 'api.projectoxford.ai';
const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;
const UserSecret = process.env.UserSecret;

var request = require('request-promise').defaults({
    encoding: null
});

var useEmulator = (process.env.NODE_ENV == 'development');
var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});
if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function () {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());
} else {
    module.exports = {
        default: connector.listen()
    }
}


var whichAddress = {
    Business: 'Business',
    Residence: 'Residence',
    Both: 'Both'
};

var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
});

var recognizer = new builder.LuisRecognizer(LuisModelUrl);
bot.recognizer(recognizer);
bot.library(require('./libs/addressChange').createLibrary());

bot.dialog('addresschange', [
    function (session, args, next) {
        // session.send('Hello, address update it is!');

        // try extracting entities
        var relation = builder.EntityRecognizer.findEntity(args.intent.entities, 'addresschange.forwho::addresschange.personrelation');
        var which = builder.EntityRecognizer.findEntity(args.intent.entities, 'busres');
        var policyNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'addresschange.forwho::addresschange.policynumber');

        if (relation) {
            // relation detected
            if (relation.entity == "my") {
                session.dialogData.addressChangeType = "own";
                if (which) {
                    session.send('Okay, let\'s change your ' + which.entity + ' address!');
                    session.dialogData.ownBusRes = which.entity;
                    next({
                        response: which.entity
                    });
                } else {
                    builder.Prompts.choice(
                        session,
                        'Sure, but which address specifically?', [whichAddress.Both, whichAddress.Business, whichAddress.Residence], {
                            maxRetries: 3,
                            retryPrompt: 'Sorry but you don\'t have such an address, try again!',
                            listStyle: builder.ListStyle.button
                        });
                }
            } else if (relation.entity == "owner" || relation.entity == "insured") {
                session.dialogData.addressChangeType = relation.entity;
                if (policyNumber) {
                    session.dialogData.policyNumber = policyNumber.entity;
                    session.send('Okay, let\'s change policy ' + policyNumber.entity + '\'s ' + relation.entity + ' address!');
                    next({
                        response: policyNumber.entity
                    });
                } else {
                    builder.Prompts.text(session, 'Sure, but ' + relation.entity + ' of which policy number specifically?');
                }
            }
        } else {
            // no entities detected, ask user for a destination
            session.send('Sorry but I do not understand');
            session.replaceDialog('addressChange');
        }
    },
    function (session, results) {
        var answer = results.response;
        if (session.dialogData.addressChangeType == "own" && !session.dialogData.ownBusRes) {
            session.dialogData.ownBusRes = answer.entity;
            session.send('Okay, let\'s change your ' + answer.entity + ' address!');
        }
        if ((session.dialogData.addressChangeType == "owner" || session.dialogData.addressChangeType == "insured") && !session.dialogData.policyNumber) {
            session.dialogData.policyNumber = answer;
            session.send('Okay, let\'s change policy ' + answer + '\'s ' + session.dialogData.addressChangeType + ' address!');
        }
        builder.Prompts.confirm(session, 'Would you like to take a snap of any government ID with address & upload?');
    },
    function (session, results) {
        if (results.response) {
            builder.Prompts.attachment(session, 'Awesome! please go ahead and upload one.');
        } else {
            session.beginDialog('address:/', {
                promptMessage: 'That\'s no problem, '
            });
        }
    },
    function (session, results, next) {
        var msg = session.message;

        if (msg.attachments.length > 0) {
            var attachment = msg.attachments[0];
            var fileDownload = checkRequiresToken(msg) ?
                requestWithToken(attachment.contentUrl) :
                request(attachment.contentUrl);

            fileDownload.then(
                function (response) {
                    var address = "";
                    var isDL = false;
                    var input = {
                        "requests": [{
                            "image": {
                                "content": response.toString('base64')
                            },
                            "features": [{
                                "type": "TEXT_DETECTION"
                            }]
                        }]
                    }
                    try {
                        requestApi.post(visionApiUrl, {
                            json: true,
                            body: input
                        }, function (err, res, body) {

                            if (!err && res.statusCode === 200) {
                                var buildingNoFound = false;
                                var stateFound = false;
                                var addressCaptured = false;
                                var m = false,
                                    d = false,
                                    l = false;
                                var textArray = body.responses[0].textAnnotations;
                                Array.from(textArray).forEach(function (t) {
                                    var t1 = t.description;
                                    if (t1.toLowerCase() == "driver\'s") d = true;
                                    if (t1.toLowerCase() == "license") l = true;
                                    if (!addressCaptured) {
                                        if (buildingNoFound && stateFound) {
                                            address = address + " " + t1;
                                            addressCaptured = true;
                                        } else if (buildingNoFound) {
                                            address = address + " " + t1;
                                            if (states.indexOf(t1) != -1) stateFound = true;
                                        } else {
                                            if (!isNaN(t1)) { //add last name to start capturing address for all states
                                                address = t1;
                                                buildingNoFound = true;
                                            }
                                        }
                                    }
                                });
                                if (d && l && address != "") {
                                    var reply = new builder.Message(session)
                                        .text('Address detected in the image is ' + address);
                                    session.send(reply);
                                    session.dialogData.AttachmentAddress = "Found";
                                    session.dialogData.NewAddress = address;
                                    builder.Prompts.confirm(session, "Can I use this as the new address?");
                                } else {
                                    session.dialogData.AttachmentAddress = "None";
                                    session.beginDialog('address:/', {
                                        promptMessage: 'Sorry, but I could not find an address from the image, '
                                    });
                                }
                            }
                        });
                    } catch (e) {
                        var c2 = new builder.Message(session)
                            .text('Catch ' + e);
                        session.send(c2);
                    }
                    var reply = new builder.Message(session)
                        .text('Hang on.. let me grab the address from the image file you uploaded.');
                    session.send(reply);
                    session.sendTyping();

                }).catch(function (err) {
                var reply = new builder.Message(session)
                    .text('Error downloading.' + err.response.statusMessage);
                session.send(reply);
                console.log('Error downloading attachment:', {
                    statusCode: err.statusCode,
                    message: err.response.statusMessage
                });
            });

        } else {
            session.dialogData.AttachmentAddress = "None";
            next({
                address: results.address
            });
        }
    },
    function (session, results) {
        var answer = results.address;
        if (session.dialogData.AttachmentAddress == "None") {
            session.dialogData.NewAddress = answer;
        }
        var text = "";
        if (session.dialogData.addressChangeType == "own") {
            text = `Your new  ${session.dialogData.ownBusRes} address `;
        } else {
            text = `The new address of the ${session.dialogData.addressChangeType} of the policy ${ session.dialogData.policyNumber} `
        }
        var msg = new builder.Message(session).addAttachment(new builder.HeroCard(session)
            .title('Address Change Completed')
            .subtitle(`New address: ${session.dialogData.NewAddress}`)
            .text(`${text} has been updated in our system and a confirmation mail will be sent to the new & old address in 2 business days. Thank you!`)
            .images([
                builder.CardImage.create(session, 'http://clipartix.com/wp-content/uploads/2016/04/Smiley-face-clip-art-thumbs-up-free-clipart-images-2-3.png')
            ]));
        session.send(msg);
        session.endDialog();

    }
]).triggerAction({
    matches: 'addresschange',
    onInterrupted: function (session) {
        session.send('Sorry but something went wrong..we need to start over!');
        session.replaceDialog('addresschange');
    }
}).cancelAction('cancel', "Ok sure, address change cancelled! :)", {
    matches: /^cancel/i,
    confirmPrompt: "Are you sure?"
});

bot.dialog('allocationchange', [function (session, args, next) {
    var policynumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'policynumber');
    if (policynumber) {
        if ("70000002|72323792|79238238|79232389|78239023".indexOf(policynumber.entity) > 0) {
            next({
                response: policynumber
            })
        } else {
            builder.Prompts.choice(
                session,
                `Oops:( looks like ${policynumber.entity} is either not eligible allocation changes now or you don't have the right access. Here are eligible ones!`, "70000002|72323792|79238238|79232389|78239023", {
                    maxRetries: 3,
                    retryPrompt: 'Sorry but that is not a valid policy number!',
                    listStyle: builder.ListStyle.list
                });
        }

    } else {
        builder.Prompts.choice(
            session,
            'Sure thing! for which policy specifically? These are eligible policies for an allocation changes now!', "70000002|72323792|79238238|79232389|78239023", {
                maxRetries: 3,
                retryPrompt: 'Sorry but that is not a valid policy number!',
                listStyle: builder.ListStyle.list
            });
    }
    // session.endDialog('Hi! Sorry changing allocations are not yet supported');
}, function (session, results, next) {
    if (!results.response) {
        // exhausted attemps and no selection, start over
        session.send('Ooops:( Too many attemps :( But don\'t worry, I\'m handling that exception and you can try again from begining!');
        return session.endDialog();
    } else {
        var policy = results.response;
        session.dialogData.policy = policy.entity
        session.send(`Okay, let\'s change your some allocations for policy ${policy.entity}.`);
        builder.Prompts.text(session, `**2-step Verification Required.** Please enter the verification code generated by your mobile app. [Problems with your code?](http://april-web.firebaseapp.com/email)`);

    }
}, function (session, results, next) {
    var userToken = results.response;

    var verified = speakeasy.totp.verify({
        secret: UserSecret,
        encoding: 'base32',
        token: userToken
    });
    if (verified) {
        session.dialogData.autheticated = true;
        next();
    } else {
        builder.Prompts.text(session, `Sorry, in correct code. Please try again one more time.`);
    }
}, function (session, results, next) {
    if (!session.dialogData.autheticated) {
        var userToken = results.response;
        var verified = speakeasy.totp.verify({
            secret: UserSecret,
            encoding: 'base32',
            token: userToken
        });
        if (verified) {
            session.dialogData.autheticated = true;
            next();
        } else {
            session.send('Ooops incorrect authentication code again :( But don\'t worry, I\'m handling that exception and you can try again from begining!');
            return session.endDialog();
        }
    } else {
        next();
    }
}, function (session, results, next) {
    session.send("Okay..so what changes can we do?");
}]).triggerAction({
    matches: 'allocationchange'
}).cancelAction('cancel', "Ok then, allocation changes cancelled :)", {
    matches: /^cancel/i,
    confirmPrompt: "Are you sure?"
});;

bot.dialog('help', function (session) {
    session.endDialog('Hi! Try telling me things like \'change an address for a policy owner\', \'do an allocation change\'');
}).triggerAction({
    matches: 'help'
});

// Spell Check
if (true) {
    bot.use({
        botbuilder: function (session, next) {
            // if (hasAudioAttachment(session)) {
            //     var stream = getAudioStreamFromMessage(session.message);
            //     speechService.getTextFromAudioStream(stream)
            //         .then(function (text) {
            //             session.message.text = session.message.attachments[0].contentType;
            //             next();
            //         })
            //         .catch(function (error) {
            //             console.error(error);
            //               session.message.text = error;
            //             next();
            //         });
            // } else {
            session.sendTyping();
            spellService
                .getCorrectedText(session.message.text)
                .then(function (text) {
                    session.message.text = text;
                    next();
                })
                .catch(function (error) {
                    console.error(error);
                    next();
                });
            // }
        }
    });
}


// Request file with Authentication Header
var requestWithToken = function (url) {
    return obtainToken().then(function (token) {
        return request({
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/octet-stream'
            }
        });
    });
};

// Promise for obtaining JWT Token (requested once)
var obtainToken = Promise.promisify(connector.getAccessToken.bind(connector));


//=========================================================
// Utilities
//=========================================================
function base64_encode(file) {
    var bitmap = fs.readFileSync(file);
    return new Buffer(bitmap).toString('base64');
}

function hasAudioAttachment(session) {
    return session.message.attachments.length > 0 &&
        (session.message.attachments[0].contentType === 'audio/wav' ||
            session.message.attachments[0].contentType === 'application/octet-stream' ||
            session.message.attachments[0].contentType === 'audio/aac'
        );
}

function getAudioStreamFromMessage(message) {
    var headers = {};
    var attachment = message.attachments[0];
    if (checkRequiresToken(message)) {
        // The Skype attachment URLs are secured by JwtToken,
        // you should set the JwtToken of your bot as the authorization header for the GET request your bot initiates to fetch the image.
        // https://github.com/Microsoft/BotBuilder/issues/662
        connector.getAccessToken(function (error, token) {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, {
                headers: headers
            });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    return needle.get(attachment.contentUrl, {
        headers: headers
    });
}

function checkRequiresToken(message) {
    return message.source === 'skype' || message.source === 'msteams';
}

function processText(text) {
    var result = 'You said: ' + text + '.';

    if (text && text.length > 0) {
        var wordCount = text.split(' ').filter(function (x) {
            return x;
        }).length;
        result += '\n\nWord Count: ' + wordCount;

        var characterCount = text.replace(/ /g, '').length;
        result += '\n\nCharacter Count: ' + characterCount;

        var spaceCount = text.split(' ').length - 1;
        result += '\n\nSpace Count: ' + spaceCount;

        var m = text.match(/[aeiou]/gi);
        var vowelCount = m === null ? 0 : m.length;
        result += '\n\nVowel Count: ' + vowelCount;
    }

    return result;
}