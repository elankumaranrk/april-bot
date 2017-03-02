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


// Export createLibrary() function
module.exports.createLibrary = function () {
    return lib.clone();
};