# Radio France

## Overview

This integration shows in Gladys what is on air on the **Radio France** stations: France Inter, franceinfo, France Culture, France Musique, FIP, Mouv’, the **ICI** local stations (formerly France Bleu) and the web radios. For each station you follow you get the show, the segment inside it (the news, a column) and the track, and your scenes can react when a new show, segment or track starts.

The data comes from the official **Open API** of Radio France, with your own API key. The integration is **unofficial and not affiliated with Radio France**. It never plays a stream: the Open API may not be used for live listening.

### Terms of use

Using the Open API means accepting its terms: a personal key, private and non-commercial use, the data shown as it is and never stored, and the credit **“données fournies par l’Open API Radio France”** (data provided by the Radio France Open API), which every widget of the integration shows. The integration keeps the data in memory only, an hour at most; `/data` only holds its request counter and your follow switches. No Radio France logo is used.

## Prerequisites

- Gladys Assistant 5.1.0 or later.
- A free **Open API key**, personal: each Gladys user requests their own.
- Internet access from Gladys (the requests go to `openapi.radiofrance.fr`).

### Get your Open API key

1. Create an account on [developers.radiofrance.fr](https://developers.radiofrance.fr).
2. In **My account**, click **Request an API key**.
3. Give the name of your project (for example “Gladys at home”) and its purpose (for example “show what is on air on my home automation dashboard”).
4. Radio France checks each request by hand and sends the key by e-mail, often within the day.
5. Paste the key in the configuration of the integration, save, then press **Test the API key**.

## Configuration

| Field                      | Default | What it does                                                                                                                       |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Open API key               | —       | Your key. Sent to Radio France in a header of each request, never shown again nor written in the logs.                             |
| Language of the texts      | French  | Feature names, status messages and the sentences of the scene actions. Titles of Radio France are never translated.                |
| Daily budget (requests)    | 900     | Requests the integration allows itself per day, out of the 1,000 of the key (100 to 1,000). Lower it if the key is used elsewhere. |
| Minimum interval (seconds) | 90      | Never two readings closer than this (60 to 600). The budget may space them more.                                                   |

**Test the API key** reads the list of stations (one request), updates the Discover tab and shows the requests used today.

## Usage

### Devices

Open the **Discover** tab of the integration and add the stations you want. The list comes from the API, with the names Radio France gives them.

| Feature | Notes                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show    | The show on air (its name). A dash when there is none: FIP and its web radios play music without shows most of the time.                                 |
| Segment | The segment inside the show: the news, a column, an interview. A dash between two segments.                                                              |
| Track   | “Artist – Title” of the track on air, on the music stations. A dash otherwise.                                                                           |
| Follow  | On by default. **Only the stations you follow are asked.** Turn it off for the stations you do not listen to, or let a scene turn it on when you listen. |

### Quota and readings

A key allows **1,000 requests a day**; past that, Radio France blocks it until the next day. The integration counts every request it sends and asks up to **10 stations in one request**. It waits for the end of the show, segment or track on air before asking again (never sooner than the minimum interval, at least every 15 minutes), and spreads the requests over the rest of the day when the budget runs low. When nothing is followed, it sends no request at all. The counter is assumed to reset at **midnight, Paris time** (Radio France does not say).

The scene actions, the **Refresh** button and the “Upcoming shows” widget use the same budget. When it is used up, they say so and wait for midnight.

### Dashboard widgets

![The widgets of the integration: now on air on a talk station and on a music station, the upcoming shows, the usage of the Open API (generated illustration, not a screenshot)](https://raw.githubusercontent.com/William-De71/gladys-radio-france/main/docs/assets/widgets.en.png)

- **Now on air**: the show, the episode, the segment, the track, the end of the show and the time of the last reading, with a **Refresh** button (one request, at most once a minute).
- **Upcoming shows**: the next shows of a station, from its program grid (read at most every 15 minutes). FIP and its web radios do not publish their schedule in advance.
- **Open API usage**: the requests of the day against the budget, the state (OK, quota pause, key refused…), the next reading, the stations followed.

Choose the station in the settings of a widget (the first station followed by default). The image above is a generated illustration with made-up programs, not a screenshot.

### Scenes

Triggers, for the stations you follow (seen by the regular readings, so up to a few minutes after the start; never at the first reading after a restart):

- **Radio France: new track** — title, artist, album, year, record label.
- **Radio France: show started** — show, episode title, summary, web page, end time.
- **Radio France: segment started** — the same variables, for the news, a column, an interview.

Actions:

- **Radio France: what is on air** — show, segment, track, artist, album and end of the show, for a notification or a spoken message.
- **Radio France: upcoming shows** — the next shows within 12 hours, with a sentence to read out (“Coming up on France Inter: …”).

Examples: when the 7 o’clock news starts on France Inter, turn the kitchen radio up; when a new track starts on FIP, show it on the TV; every evening at 7 pm, have Gladys read the shows of the evening on France Culture.

## Troubleshooting

- **“Radio France refuses the API key”**: check the key (no space before or after it). A new key may need a few minutes before it works. The integration tries again after 5 minutes, then less and less often (up to an hour).
- **“Daily quota reached” or “Daily budget used”**: everything waits for midnight (Paris time). Follow fewer stations, raise the minimum interval, or check that the key is not used by another program.
- **“The Open API does not answer”**: the service or your internet access is down; the integration tries again a little later. A “server error” may also mean that the quota of the key is used elsewhere.
- **A station never updates**: check that its **Follow** switch is on and look at the “Open API usage” widget. A station Radio France removed from its list is no longer asked.
- **FIP has no show**: that is normal, FIP and its web radios mostly play music without shows.
- For an issue, give the versions of Gladys and of the integration, the message of **Test the API key** (it never shows the key), and the logs with `DEBUG=gladys-integration-sdk`.
