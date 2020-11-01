class MessageItem
{
    constructor()
    {
    }

    static createFromTwilioMessage = (twilioMessage) => {
        let newMessage = {
            _id: twilioMessage.sid,
            text: twilioMessage.body,
            createdAt: twilioMessage.timestamp,
            user: {
                _id: twilioMessage.author
            },
        };

        return newMessage;
    }


}
export default MessageItem;
