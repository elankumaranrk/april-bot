var builder = require('botbuilder');


var lib = new builder.Library('main');
lib.dialog('/', [
    function (session) {
        // Ask for delivery address using 'address' library
        session.beginDialog('address:/',
            {
                promptMessage: session.gettext('provide_delivery_address', session.message.user.name || session.gettext('default_user_name'))
            });
        
    },
    function(session) {
        session.endDialog();
}]);

var intents = new builder.IntentDialog({
    })
    .matches('greeting', (session, args) => {
        session.send('Hi! This is the None intent handler. You said: \'%s\'.' + luisAppId, session.message.text);
    })


// Export createLibrary() function
module.exports.createLibrary = function () {
    return lib.clone();
};