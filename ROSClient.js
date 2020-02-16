
var ROSLIB = require('roslib');

/**
 * Establishes connection to a ROS master via websocket.
 **/
module.exports = function(options){
    var that = this;
    // Object that holds user information
    this.flask_user = options.flask_user;
    // ROS handle
    this.ros = undefined;
    // URL for ROS server
    var rosURL = options.ros_url || 'ws://localhost:9090';
    // Use rosauth?
    var authentication = options.authentication === '' ? true : options.authentication === 'True';
    // URL for rosauth token retrieval
    var authURL = options.auth_url || '/wsauth/v1.0/by_session';
    // global rosprolog handle
    var prolog;
    
    // true iff connection to ROS master is established
    this.isConnected = false;
    // true iff registerNodes was called before
    this.isRegistered = false;
    // true after registerNodes has completed
    this.nodesRegistered = false;

    this.connect = function (on_connection,on_error,on_close) {
      if(that.ros) return;
      that.ros = new ROSLIB.Ros({url : rosURL});
      that.ros.on('connection', function() {
          that.isConnected = true;
          console.log('Connected to websocket server.');
          if (authentication) {
              // Acquire auth token for current user and authenticate, then call registerNodes
              that.authenticate(authURL, function() {
                  that.on_connection(on_connection);
	      });
          } else {
              // No authentication requested, call registerNodes directly
              that.on_connection(on_connection);
          }
      });
      that.ros.on('close', function() {
          console.log('Connection was closed.');
          that.ros = undefined;
          that.isRegistered = false;
          if(on_close) on_close();
          setTimeout(function() {
              that.connect(on_connection,on_error,on_close);
          }, 500);
      });
      that.ros.on('error', function(error) {
          console.log('Error connecting to websocket server: ', error);
          if(that.ros) that.ros.close();
          that.ros = undefined;
          that.isRegistered = false;
          if(on_close) on_error(error);
          setTimeout(function() {
              that.connect(on_connection,on_error,on_close);
          }, 500);
      });
    };

    this.authenticate = function (authurl, then) {
        console.log("Acquiring auth token");
        // Call wsauth api to acquire auth token by existing user login session
        $.ajax({
            url: authurl,
            type: "GET",
            contentType: "application/json",
            dataType: "json"
        }).done( function (request) {
            if(!that.ros) {
                console.warn("Lost connection to ROS master.");
                return;
            }
            console.log("Sending auth token");
            that.ros.authenticate(request.mac,
                             request.client,
                             request.dest,
                             request.rand,
                             request.t,
                             request.level,
                             request.end);
            
            // If a callback function was specified, call it in the context of Knowrob class (that)
            if(then) {
                then.call(that);
            }
        });
    };
    
    function containerRefresh() {
        $.ajax({
            url: '/api/v1.0/refresh_by_session',
            type: "GET",
            contentType: "application/json",
            dataType: "json"
        });
    };
    
    this.on_connection = function (on_connection) {
      if(that.isRegistered) return;
      that.isRegistered = true;
      if(on_connection) on_connection(that.ros);
      //
      setInterval(containerRefresh, 570000);
      containerRefresh();
      // Setup publisher that sends a dummy message in order to keep alive the socket connection
      {
          var interval = options.interval || 30000;
          // The topic dedicated to keep alive messages
          var keepAliveTopic = new ROSLIB.Topic({ ros : that.ros, name : '/keep_alive', messageType : 'std_msgs/Bool' });
          // A dummy message for the topic
          var keepAliveMsg = new ROSLIB.Message({ data : true });
          // Function that publishes the keep alive message
          var ping = function() { keepAliveTopic.publish(keepAliveMsg); };
          // Call ping at regular intervals.
          setInterval(ping, interval);
      };
      that.nodesRegistered = true;
    };
};
