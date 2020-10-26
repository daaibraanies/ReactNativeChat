import React, { Component, useState, useCallback, useEffect } from 'react'
import { GiftedChat, Bubble, Send} from 'react-native-gifted-chat'
import {Text, View, StyleSheet} from 'react-native';
import { Client as TwilioChatClient } from "twilio-chat";

const styles = StyleSheet.create({
  sendingContainer: {
    justifyContent: 'center',
    alignItems: 'center'
  }
});
class NewChat extends Component{
  constructor(props){
    super(props);
    this.params = this.props.route.params;
    this.channel = this.params.channel;
    this.state = {
      messages: this.params.messages,
    }
  }

  //TODO: anchor will be needed for loading messages not from the begining but from the point
  // where the last downloaded batch eneded. Need to store the last batch index somewhere.
  getMessageBatch = (channel,batchSize=30,anchor=null,direction=nul) =>
  {
    //Loads a batch of batchSize last messages in the channel,
    //otherwise ???
    try
    {
      return channel.getMessages(batchSize).item;
    }
    catch (exception)
    {
      return '';
    }
  }


  componentDidMount(){
    // console.log(this.props.route.params)
  }

  //TODO: Ask Likhita about this quite strange way to handle new messgaes
  onSend(messages){
    console.log(messages)
    try
    {
      this.channel.sendMessage(messages[0]);
      this.params.usersAppendMessage(messages[0], this.params.index);
      this.setState(
          {messages: GiftedChat.append(this.state.messages, messages[0])}
          );
    }
    catch (exception)
    {
      //TODO: add the message locally and display that is has not been sent
    }
  }

  renderSend(props) {
    return (
      <Send {...props}>
        {/* <View style={{alignItems: 'center' }}> */}
          <Text style={{fontSize: 20, color: "#5386C9", paddingBottom: "3%", paddingRight: "1%"}}>Send</Text>
        {/* </View> */}
      </Send>
    );
  }
  renderBubble (props) {
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          left: {
            backgroundColor: '#fff'
          },
          right: {
            backgroundColor: '#5386C9'
          },
        }}
      />
    )
  }
  parsePatterns = (_linkStyle) => {
    return [
      {
        pattern: /#(\w+)/,
        style: { textDecorationLine: 'underline', color: 'darkorange' },
        onPress: () => Linking.openURL('http://gifted.chat'),
      },
    ]
  }
  render(){
    return(
      <>
        <GiftedChat
            messages={this.state.messages}
            onSend={messages => this.onSend(messages)}
            user={{_id: 1,}}
            renderBubble={this.renderBubble}
            isTyping ={true}
            alwaysShowSend={true}
            // showUserAvatar={true}
            // bottomOffset={100}
            parsePatterns={this.parsePatterns}
            renderSend={this.renderSend}
          />
      </>

    );
  }
}

export default NewChat;
