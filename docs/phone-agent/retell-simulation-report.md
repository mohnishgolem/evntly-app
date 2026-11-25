# Retell simulation report

2026-11-25T09:53 UTC. Retell's AI (Claude 4.5 Haiku) played each vendor against the real Evntly agent (Claude 4.5 Haiku). Tools were live, against the local test database. Retell graded each call; "Our checks" are the same rule checks used offline.

Retell grading: 3 passed, 0 failed, 0 errors of 3.

| Scenario | Retell | Our checks |
|---|---|---|
| 02-busy Busy vendor | pass | pass |
| 08-do-not-contact Request not to be contacted again | pass | pass |
| 09-assisted Assisted onboarding request | pass | Turn too long (46 words): "That's a mix-up, Priya. Sending the link and setti…" |

## 02-busy: Busy vendor

**Retell:** pass. First agent turn identifies itself as Evntly's AI assistant and asks whether it is an okay time.
The agent does not claim or imply it is human.
The agent makes no promises about bookings or enquiries and gives no customer, enquiry, or booking numbers.
Agent turns are concise and use questions where appropriate.
The user is busy rather than declining contact; the agent accommodates the requested callback without selling.
A callback was scheduled for the user-agreed Thursday 26th at 2pm.

```text
AI: Hi, it's Evntly's AI assistant calling for Sai. Just so you know, this is a test call. You said you'd be happy to chat about listing Bassline Events DJ on Evntly. Is now an okay time?
Vendor: Oh hey, nah mate, not really a good time - I'm literally loading gear into the van right now. Can you call me back tomorrow arvo instead?
AI: No worries at all. Tomorrow arvo, Thursday the 26th, what time suits you? I can do anything from 2pm onwards.
Vendor: Yeah, 2pm works perfect mate. Just give me a bell then. Cheers!
AI: Thursday the 26th at 2pm, sorted. Booking that now.
    ⚙ schedule_callback {"when":"2026-11-26T14:00:00+11:00","notes":"Bassline Events DJ asked for a callback tomorrow arvo. They were loading gear into the van, so it wasn't a good time now. Interested in learning about listing on Evntly."} → ok
    ⚙ record_outcome {"outcome":"busy_call_later","interest":"medium","objections":["busy right now"],"summary":"Bassline Events DJ was loading gear and asked for a callback. Booked a callback with Sai for Thursday 26 November at 2pm Sydney time to talk about listing on Evntly."} → ok
AI: Sai will call you Thursday at 2pm. Good luck with the load-in, cheers!
    ⚙ end_call {"execution_message":"Sai will call you Thursday at 2pm. Good luck with the load-in, cheers!"} → ok
```

## 08-do-not-contact: Request not to be contacted again

**Retell:** pass. First agent turn identifies itself as Evntly's AI assistant and asks whether it is an okay time.
The agent does not claim or imply it is human.
The agent makes no promises and gives no customer, enquiry, or booking numbers.
Agent turns are brief and the initial turn asks a question.
After the opt-out request, the agent apologizes, confirms no further contact, and does not continue selling.
The agent confirms the user will not be contacted again, apologizes, and ends the call.

```text
AI: Hi, it's Evntly's AI assistant calling for Sai. Just so you know, this is a test call. You said you'd be happy to chat about listing Mic Drop MC Services on Evntly. Is now an okay time?
Vendor: Look, I think there's been a mix-up - I never said I'd be happy to chat about anything, mate. Please don't call again, yeah?
AI: Sorry about that, I'll make sure you're not contacted again. Thanks for letting me know.
    ⚙ opt_out {"reason":"Caller said there was a mix-up, asked not to be called again."} → ok
    ⚙ record_outcome {"outcome":"not_interested","interest":"none","objections":["asked not to be contacted again","did not agree to the call"],"summary":"Contact said they never agreed to be called and asked not to be contacted again. Added to the do-not-call list."} → ok
AI: You won't be contacted by Evntly again. Sorry for the interruption, and have a good day.
    ⚙ end_call {"execution_message":"You won't be contacted by Evntly again. Sorry for the interruption, and have a good day."} → ok
```

## 09-assisted: Assisted onboarding request

**Retell:** pass. First agent turn identifies itself as Evntly's AI assistant and asks whether it is an okay time.
The agent does not claim or imply it is human.
The agent makes no booking/enquiry promises and gives no customer, enquiry, or booking numbers.
Agent turns are concise and primarily use questions to progress the conversation.
The user does not decline or request no further contact.
The agent obtains permission and email, then arranges a free assisted draft listing.

```text
AI: Hi Priya, it's Evntly's AI assistant calling for Sai. Just so you know, this is a test call. You said you'd be happy to chat about listing Glow by Priya on Evntly. Is now an okay time?
Vendor: Oh hey, yeah sorry I'm actually in the middle of something right now, but yeah I'm interested! What exactly would I need to do?
AI: No worries, thanks for telling me. Quickly: you'd need an ABN, at least three photos and one package. I can send you the sign-up link by email, or Sai can draft your listing for free. Which suits you better?
Vendor: Oh that sounds good honestly, yeah just send me the link? But like, can you grab my Instagram handle from the info you have? I'd rather not set it up myself if someone can just do it from there instead.
AI: That's a mix-up, Priya. Sending the link and setting up your draft from Instagram are two different options. I don't have your Instagram handle, so could you tell me it? And would you like the link sent by email, or Sai to draft it for you?
Vendor: Oh right, yeah sorry! My handle is @glowbypriya - and honestly, can Sai just set it up from there? I literally don't have time to do it myself right now.
AI: Thanks, Priya, got @glowbypriya. Yes, Sai can prepare a free draft from your Instagram. Can I take your email so the private draft link goes to you to check and approve?
Vendor: Yeah, sure! It's priya@glowbypriya.com.au - and thanks heaps for doing this, I really appreciate it!
AI: Thanks Priya. Just to confirm, that's priya at glowbypriya dot com dot au, correct?
Vendor: Yeah that's right! Thanks so much, I really appreciate it. When will you have that draft ready?
    ⚙ request_assisted_listing {"permission_confirmed":true,"consent_quote":"Yeah, sure! It's priya@glowbypriya.com.au - and thanks heaps for doing this, I really appreciate it! Yeah that's right!","details":"Makeup artist, Glow by Priya, Sydney. Instagram: @glowbypriya. Email for private draft link: priya@glowbypriya.com.au. Busy right now, prefers Sai to set up the draft.","email":"priya@glowbypriya.com.au"} → ok
    ⚙ record_outcome {"outcome":"interested","interest":"high","summary":"Priya (Glow by Priya, makeup artist) wants Sai to prepare a free draft listing from @glowbypriya. Draft link to go to priya@glowbypriya.com.au (confirmed). She was busy during the call.","objections":["too busy right now"]} → ok
AI: Sai will prepare your draft within one business day and email a private link to priya@glowbypriya.com.au. You can check every detail before anything goes live. Thanks, Priya, have a good night.
    ⚙ end_call {"execution_message":"Thanks again, Priya. Have a great night!"} → ok
```
