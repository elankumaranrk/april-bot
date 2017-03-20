// Welcome Dialog
var MainOptions = {
    Product: 'Product Info',
    Service: 'Self Services',
    Support: 'Support'
};


var bot = new builder.UniversalBot(connector, function (session) {

    if (session.userData.notification != null) {
        return session.beginDialog('main:/');
    } else {

        var notificationCard = new builder.HeroCard(session)
            .title('Hello')
            .subtitle(getFormattedDate(new Date())) 
            .text("Here are your personalized messages for the day!" )
            .images([
                new builder.CardImage(session)
                .url('https://blog.malwarebytes.com/wp-content/uploads/2014/04/photodune-7137346-web-design-concept-update-on-computer-keyboard-background-s-900x506.jpg')
                .alt('Notifications')
            ])
            .tap(builder.CardAction.openUrl(session, "https://www.google.com/search?q=1+min+timer"));

        session.send(new builder.Message(session)
            .addAttachment(notificationCard));
        session.send("Total Commissions earned so far this week:   \n\n 1. New Business: **$3223.00** \n 2. Inforce Premium:**$2.00**");
        session.send("Pending Trainings:\n\n 1. Insurance Agent Licensing for Life & Annuity \n 2. Adjuster Licensing");

        var welcomeCard = new builder.HeroCard(session)
            .title('April Bot')
            .subtitle('How may I help you today?')
            .images([
                new builder.CardImage(session)
                .url('https://blogs-images.forbes.com/jacobmorgan/files/2014/05/internet-of-things-2.jpg')
                .alt('Tata Consultancy Services')
            ])
            .buttons([
                builder.CardAction.imBack(session, session.gettext(MainOptions.Product), MainOptions.Product),
                builder.CardAction.imBack(session, session.gettext(MainOptions.Service), MainOptions.Service),
                builder.CardAction.imBack(session, session.gettext(MainOptions.Support), MainOptions.Support)
            ]);
        session.userData.notification = 'done';
        session.send(new builder.Message(session)
            .addAttachment(welcomeCard));

    }
});

// Enable Conversation Data persistence
bot.set('persistConversationData', true);


// Send welcome when conversation with bot is started, by initiating the root dialog
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/');
            }
        });
    }
});

// Sub-Dialogs
bot.library(require('./libs/main').createLibrary());
bot.library(require('./libs/address').createLibrary());
bot.recognizer(recognizer);



var intents = new builder.IntentDialog({
        recognizers: [recognizer]
    })
    .matches('None', (session, args) => {
        session.send('Hi! This is the None intent handler. You said: \'%s\'.' + luisAppId, session.message.text);
    })
    .matches('greeting', (session, args) => {
        var welcomeCard = new builder.HeroCard(session)
            .title('welcome_title')
            .subtitle('welcome_subtitle')
            .images([
                new builder.CardImage(session)
                .url('https://placeholdit.imgix.net/~text?txtsize=56&txt=Contoso%20Flowers&w=640&h=330')
                .alt('contoso_flowers')
            ])
            .buttons([
                builder.CardAction.imBack(session, session.gettext(MainOptions.Shop), MainOptions.Shop),
                builder.CardAction.imBack(session, session.gettext(MainOptions.Support), MainOptions.Support)
            ]);

        session.send(new builder.Message(session)
            .addAttachment(welcomeCard));
    })
    .matches('addresschange', [
        function (session) {
            session.beginDialog('/addresschange');
        },
        function (session, results) {
            session.send('Ok... done!');
        }
    ])
    .matches('weather', (session, args) => {
        session.send('Hmmm weather data has not been hooked up yet!');
    })
    .onDefault((session) => {
        session.send('Sorry, I did not understand \'%s\'.', session.message.text);
    });

// bot.dialog('/', intents);

bot.dialog('/addresschange', [
    function (session, args, next) {
        // Resolve and store any entities passed from LUIS.
        session.send('Sure address change it is..whose address you would like to change?');
        var intent = args.intent;
        var who = builder.EntityRecognizer.findEntity(intent.entities, 'addresschange.forwho');
        var relation = builder.EntityRecognizer.findEntity(intent.entities, 'addresschange.forwho');

        // var alarm = session.dialogData.alarm = {
        //   title: title ? title.entity : null,
        //   timestamp: time ? time.getTime() : null  
        // };

        // Prompt for title
        if (!alarm.who) {
            builder.Prompts.text(session, 'Whose address needs a change?');
        } else {
            if (who == "my")
                session.send('Changing your address...');
            next();
        }
    },
    function (session, results) {
        session.endDialog();
    }

])
