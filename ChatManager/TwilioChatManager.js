import {Client as TwilioChatClient} from "twilio-chat";
import EventEmitter from "react-native-web/dist/vendor/react-native/emitter/EventEmitter";
import ChatItem from "./ChatItem";
import ChatPreview from "./ChatPreview";
import ChannelItem from "./ChanneItem";
import MessageItem from "./MessageItem";

class TwilioChatManager
{
    //TODO: rewrite it into a singleton pattern
    constructor(userName)
    {
        this.accessToken = null;
        this.chatClient = null;
        this.userName = userName;
        this.eventEmitter = new EventEmitter();
        this.isInitialized = false;
        this.messageBatchSize = 25;

        this.chatItems = [];
        this.channels = [];

        this.setNewToken();
        this.initializeClient();

        this.INITIAL_MESSAGE_TEXT = 'Hi! Join me in the chat!';
    }

    static create = (username) => {
        return new Promise((resolve,reject) => {
            resolve(new TwilioChatManager(username));
        });
    }


    //TODO: add unConsumedLogic
    loadChannels =  () => {
            this.chatItems = [];
            this.chatClient.getUserChannelDescriptors().then((paginator) => {
                Promise.all(paginator.items).done((descriptors) => {
                    let channels = [];
                    for(let i = 0;i<descriptors.length;i++)
                    {
                        this.chatItems.push(new ChatItem());
                        channels.push(descriptors[i].getChannel());
                    }

                    Promise.all(channels).then(() => {
                        let messageHistories = [];
                        let channelUsersPromises = [];
                        let unreadMessageCountPromises = [];

                        for(let i = 0 ;i<channels.length;i++){
                            channels[i].then((channel) => {
                                this.channels.push(ChannelItem.createFromTwilioChannel(channel));
                                this.chatItems[i].setChannelSID(channel.sid);
                                this.chatItems[i].setChannelName(channel.uniqueName);

                                messageHistories.push(channel.getMessages(this.messageBatchSize));
                                channelUsersPromises.push(channel.getMembers());
                                unreadMessageCountPromises.push(channel.getUnconsumedMessagesCount());
                            });
                        }

                       Promise.all(messageHistories).then(()=>{
                            for(let i = 0;i<messageHistories.length;i++){
                                messageHistories[i].then((messageHistory) => {
                                    Promise.all(messageHistory.items).then((messages) => {
                                        this.chatItems[i].setMessageHistory(messages);
                                        this.chatItems[i].update();
                                    });
                                });
                            }
                        });

                        Promise.all(channelUsersPromises).done(()=>{
                            for(let i = 0;i<channelUsersPromises.length;i++){
                                channelUsersPromises[i].then((channelMembers) => {
                                    this.chatItems[i].chatPreview.setMembers(channelMembers,this.userName);
                                });
                            }
                        });

                        Promise.all(unreadMessageCountPromises).then(()=>{
                           for(let i = 0;i<unreadMessageCountPromises.length;i++){
                               unreadMessageCountPromises[i].then((number) =>{
                                   //console.log('Unconsumed: ');
                                   //console.log(number);

                                   if (typeof number === 'number')
                                       this.chatItems[i].chatPreview.unreadMessagesCount = number.toString();
                                   else
                                   {
                                       //TODO: handle this error
                                       this.chatItems[i].chatPreview.unreadMessagesCount = '0';
                                   }
                               });
                           }
                        });
                    });
                    this.setInitializationState(true);
                    //console.log('Even should shoot now:');
                });
            });
    }

    initializeClient = (options={}) => {
        TwilioChatClient.create(this.accessToken,options).then((client) => {
            this.chatClient = client;
            this.subscribeForClientEvents();
        });
    };

    /*---------------------- GETTERS --------------------------*/

    getMessagesFromChat = (channelSID) => {
        for(let i = 0;i < this.chatItems.length;i++) {
            if (this.chatItems[i].channelSID === channelSID){
                return this.chatItems[i].messageHistory;
            }
        }
        console.log('Channel was not found!');
    }

    getChatPreviews = () => {
        let result = [];
        for(let i = 0;i<this.chatItems.length;i++)
            result.push(this.chatItems[i].chatPreview);
        if(result.length >= 2)
            return result.sort(this.initialChatItemsSort);
        return result;
    }

    getChatNames = () => {
        result = [];
        for(let i = 0;i<this.chatItems.length;i++)
            result.push(this.chatItems[i].channelName);
        return result;
    }

    getChannelBySID = (channelSID) => {
        for(let i = 0;i<this.channels.length;i++){
            if (this.channels[i].channel.sid === channelSID){
                return this.channels[i].channel;
            }
        }
    }

    getChatItem = (channelSID) => {
        for(let i = 0;i < this.chatItems.length;i++) {
            if (this.chatItems[i].channelSID === channelSID){
                return this.chatItems[i];
            }
        }
    }

    /*---------------------- SETTERS --------------------*/

    setInitializationState = (state) =>{
        this.isInitialized = state;
    }

    setNewToken = () => {
        this.accessToken = this.fetchNewToken();
    };

    setAllMessagesConsumed = (channelSID,lastMessageIndex) =>{
        for(let i = 0;i<this.channels.length;i++){
            if(this.channels[i].channelSID === channelSID){
                this.channels[i].channel.advanceLastConsumedMessageIndex(lastMessageIndex).then((number) => {
                    if (typeof number === 'number'){
                        // Successfull update
                    }
                    else
                    {
                        console.log('Error in Managed::setALlMessagesConsumed');
                    }
                })
            }
        }
    }

    /*---------------------- AUXILLARY --------------------*/
    createNewChannel = (otherUser) => {
        const availableUsers = ['janesmith@nuleep-rec.com','joeruiz@nuleep-rec.com','annie@user.com','louis@nuleep-user.com'];

        if(availableUsers.indexOf(otherUser) !== -1)
        {
            if(this.userName !== otherUser)
            {
                if(!this.chatExists(otherUser))
                {
                    let taskPromise = [this.chatClient.createChannel({
                                                        isPrivate: true,
                                                        uniqueName: this.concatUserNames(otherUser)
                    })];

                    Promise.all(taskPromise).then(()=>{
                        taskPromise[0].then((channel) => {
                            this.channels.push(ChannelItem.createFromTwilioChannel(channel));

                            channel.join(this.userName).then(()=>{
                                let messagePromise = [];
                                let usersPromise = [];
                                let newChatItem = new ChatItem();
                                let newMessage = {
                                    sid: 'initial_message',
                                    index: 0,
                                    body: this.INITIAL_MESSAGE_TEXT,
                                    timestamp: new Date(),
                                    author: this.userName
                                };

                                channel.add(otherUser).then(()=>{
                                    messagePromise.push(channel.sendMessage(this.INITIAL_MESSAGE_TEXT));

                                    Promise.all(messagePromise).done(()=>{
                                        messagePromise[0].then((messageIndex) => {
                                            usersPromise.push(channel.getMembers());

                                            newChatItem.setChannelName(channel.uniqueName);
                                            newChatItem.setChannelSID(channel.sid);
                                            newChatItem.setMessageHistory([newMessage]);
                                            newChatItem.update();

                                            Promise.all(usersPromise).done(()=>{
                                                usersPromise[0].then((users) => {
                                                    Promise.all(users).done(()=>{
                                                        newChatItem.chatPreview.setMembers(users,this.userName);
                                                        this.chatItems.unshift(newChatItem);
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    })
                }
            }
        }
        else
        {
            console.log('User '+otherUser+' was not found!');
        }
    }

    //Generates the uniq name for a dialogue channel for now
    concatUserNames = (otherUser) => {
        let users = [this.userName,otherUser].sort();
        return users[0]+'*'+users[1];
    }

    //TODO: perhaps need to resubscribe after connection state changed
    subscribeForChannelEvent(channelSID,event,callback){
        console.log('Got to subscribe');
        let that = this; //It refers to component
        if (!that.chatInfo.isSubscribedForNewMessages){
            let channel = that.getChannelBySID(channelSID);
            channel.on(event,callback);
            that.chatInfo.isSubscribedForNewMessages = true;
            console.log('Subscribed on channel: '+channelSID);
        }
    }

    ingestNewMessage = (channelSID,message,history,component) => {
        let messageItem = MessageItem.createFromTwilioMessage(message);

        console.log('Ingestion method in manager. (MANAGER)')
        console.log('New message index '+messageItem.index);
        console.log('New message is from '+messageItem.user);

        this.setAllMessagesConsumed(channelSID,messageItem.index);
        console.log('Message added to history form manager.');

        let chatItem = this.getChatItem(channelSID);

        history.unshift(messageItem);
        chatItem.update();

        component.setState({
            messages: history
        });
    }

    indexIsInHistory = (index,history) => {
        for (let i = 0;i<history.length;i++){
            if (history[i].index === index)
                return true;
        }
        return false;
    }

    chatExists = (otherUser) => {
        for(let i = 0;i<this.chatItems.length;i++){
            if(this.chatItems[i].chatPreview.interlocutor === otherUser){
                return true;
            }
        }
        return false;
    }

    refreshToken = (options={}) => {
        //TODO: checks on each of the steps needed.
        this.setNewToken();
        this.chatClient.updateToken(this.accessToken);
    };

    fetchNewToken = () => {
        //TODO: use gql to fetch the token
        if (this.userName === 'louis@nuleep-user.com')
            return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImN0eSI6InR3aWxpby1mcGE7dj0xIn0.eyJqdGkiOiJTSzZkYzU1ZDA0M2IzYjU0Mzk2OGQ4NjU5NGFkODI3YjIxLTE2MDQ0Njg1NTkiLCJncmFudHMiOnsiaWRlbnRpdHkiOiJsb3Vpc0BudWxlZXAtdXNlci5jb20iLCJjaGF0Ijp7InNlcnZpY2Vfc2lkIjoiSVM3ZjUxMjJmYzdhYTc0ZTA1YmYwMDU4MzVlNTNmNTk5NyJ9fSwiaWF0IjoxNjA0NDY4NTU5LCJleHAiOjE2MDQ0ODI5NTksImlzcyI6IlNLNmRjNTVkMDQzYjNiNTQzOTY4ZDg2NTk0YWQ4MjdiMjEiLCJzdWIiOiJBQ2E3NmIzZmVmZjYwZjhiOTE4NTRhNjFiMzNmNjk2NWE2In0.6jJ-tgy_ntn0YITHUvsjcQX82c01cw-zPypG2ZjAyVg';
        else if (this.userName === 'janesmith@nuleep-rec.com')
            return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImN0eSI6InR3aWxpby1mcGE7dj0xIn0.eyJqdGkiOiJTS2E5NjgyNDMwZGU3MDNjOWM0MTJkN2I1OGI0NTlkYjEyLTE2MDQ1OTkxMjMiLCJncmFudHMiOnsiaWRlbnRpdHkiOiJqYW5lc21pdGhAbnVsZWVwLXJlYy5jb20iLCJjaGF0Ijp7InNlcnZpY2Vfc2lkIjoiSVM3ZjUxMjJmYzdhYTc0ZTA1YmYwMDU4MzVlNTNmNTk5NyJ9fSwiaWF0IjoxNjA0NTk5MTIzLCJleHAiOjE2MDQ2MTM1MjMsImlzcyI6IlNLYTk2ODI0MzBkZTcwM2M5YzQxMmQ3YjU4YjQ1OWRiMTIiLCJzdWIiOiJBQ2E3NmIzZmVmZjYwZjhiOTE4NTRhNjFiMzNmNjk2NWE2In0.16nboTaLvaHZm71Rg-nSr4t-rK9RsKkZd_FcaJkQ7H4';
        else if (this.userName === 'joeruiz@nuleep-rec.com')
            return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImN0eSI6InR3aWxpby1mcGE7dj0xIn0.eyJqdGkiOiJTS2ZiYmUyYzc3N2UzYmFlNTFlMjlkYzI5ZWY5MDAxZTNmLTE2MDQ1MjI0MTgiLCJncmFudHMiOnsiaWRlbnRpdHkiOiJqb2VydWl6QG51bGVlcC1yZWMuY29tIiwiY2hhdCI6eyJzZXJ2aWNlX3NpZCI6IklTN2Y1MTIyZmM3YWE3NGUwNWJmMDA1ODM1ZTUzZjU5OTcifX0sImlhdCI6MTYwNDUyMjQxOCwiZXhwIjoxNjA0NTM2ODE4LCJpc3MiOiJTS2ZiYmUyYzc3N2UzYmFlNTFlMjlkYzI5ZWY5MDAxZTNmIiwic3ViIjoiQUNhNzZiM2ZlZmY2MGY4YjkxODU0YTYxYjMzZjY5NjVhNiJ9.BIfgj234kHw4HquMOeFsX9naiNUEXVbZyzPvwZ1CKik';
        else if (this.userName === 'annie@nuleep-user.com')
            return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImN0eSI6InR3aWxpby1mcGE7dj0xIn0.eyJqdGkiOiJTSzFkNzY5YzBkOGM3ZDBiMGI1ZTg4MmU0N2VmY2Y3OWNkLTE2MDQ1MzMzMDkiLCJncmFudHMiOnsiaWRlbnRpdHkiOiJhbm5pZUBudWxlZXAtdXNlci5jb20iLCJjaGF0Ijp7InNlcnZpY2Vfc2lkIjoiSVM3ZjUxMjJmYzdhYTc0ZTA1YmYwMDU4MzVlNTNmNTk5NyJ9fSwiaWF0IjoxNjA0NTMzMzA5LCJleHAiOjE2MDQ1NDc3MDksImlzcyI6IlNLMWQ3NjljMGQ4YzdkMGIwYjVlODgyZTQ3ZWZjZjc5Y2QiLCJzdWIiOiJBQ2E3NmIzZmVmZjYwZjhiOTE4NTRhNjFiMzNmNjk2NWE2In0.B1duwdvsX-YnhdgFwgVqudttwUK7TEDP8Ys-zdVK_Vk';
    };

    initialChatItemsSort = (chatItemA,chatItemB) => {
        return chatItemB.lastMessageDate - chatItemA.lastMessageDate;
    }

    sendMessage = (channelSID,message) => {
        this.chatClient.getChannelBySid(channelSID).then((channel) => {
            let sendingPromise = [channel.sendMessage(message)];
            Promise.all(sendingPromise).then(()=>{
                sendingPromise[0].then((result) => {
                    if (typeof result === 'number'){
                        //TODO: shoot success event
                        channel.advanceLastConsumedMessageIndex(result).then((result) => {
                            //Update the channel info: last message
                            //set last consumed index to result
                            for(let i = 0;i < this.chatItems.length;i++){
                                if(this.chatItems[i].channelSID === channelSID){
                                    this.chatItems[i].update();
                                    console.log('Updated index on server: '+result.toString());
                                    return result;
                                }
                            }
                        });
                    }
                    //TODO: check
                    // if result is number -> number is index of the new message
                    // oterwise error event
                    // Error
                    // or SessionError
                });
            })
        });
    }

    connectionChangedEvent = (connectionState) => {
        console.log('Connection changed: '+connectionState.toString());
        this.connectionState = connectionState;

        if(connectionState === 'connected'){
            this.eventEmitter.emit('client-connected');
            //this.deleteChannel();
            this.loadChannels();
        }
        else if (connectionState === 'connecting'){

        }
        console.log(this.chatClient);
    }

    subscribeForClientEvents = () => {
        this.chatClient.on('connectionStateChanged', this.connectionChangedEvent);

        this.eventEmitter.addListener('channels-loaded',()=>{console.log('Channels loaded event.');});
    }


    /* -------------------- TEST -------------------------- */

    inviteJane = () => {
        this.chatClient.getChannelBySid('CHb2184701ed364089912fd5212f88c2cb').then((channel) => {
           channel.invite("janesmith@nuleep-rec.com").then((result) => {
              console.log('Jane invited');
           });
        });
    }

    janeJoin = () => {
        this.chatClient.getChannelBySid('CHb2184701ed364089912fd5212f88c2cb').then((channel) => {
            channel.join().then((result) => {
                console.log('Jane joined');
            });
        });
    }

    joinBothUsers = () => {
        this.chatClient.getChannelBySid('CH891cbd3784684e6bb46baca067e311e3').then((channel) =>{
            channel.sendMessage(this.INITIAL_MESSAGE_TEXT);
        });
    }

    deleteChannel = () =>{
        this.chatClient.getChannelByUniqueName('janesmith@nuleep-rec.com*joeruiz@nuleep-rec.com').then((channel)=>{
            channel.delete();
        });
        this.chatClient.getChannelByUniqueName('annie@user.com*janesmith@nuleep-rec.com').then((channel)=>{
                channel.delete();
        });
/*        this.chatClient.getChannelByUniqueName('annie@user.com*joeruiz@nuleep-rec.com').then((channel)=>{
            channel.delete();
        });*/

    }

}

export default TwilioChatManager;
