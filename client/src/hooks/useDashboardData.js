import { useState, useEffect } from "react";
import axios from "axios";
import { getArtists, getSongs } from "../helpers/spotifyHelper";
import { getPerformers } from "../helpers/seatGeekHelper";

export default function useDashboardData() {
  const [state, setState] = useState({
    user: {},
    token: null,
    artists: {},
    events: {},
    artistEvent: {},
    artistSong: {},
    songEvent: {},
    allSongs: [],
    songsByGenre: {},
    currentEvent: {},
    // filtering
    currentGenre: [],
    // Spotfiy Playback SDK
    deviceId: null,
    position: 0,
    duration: 0,
    trackName: "",
    albumName: "",
    artistName: "",
    currentAlbumCover: null,
    prevAlbumCover1: null,
    prevAlbumCover2: null,
    nextAlbumCover1: null,
    nextAlbumCover2: null,
    playing: false,
    currentTrackUri: ""
  });

  const [currentPlayer, setPlayer] = useState(null);

  // obtain access token using Spotify authentication process
  useEffect(() => {
    axios
      .get("/getUser")
      .then(async res => {
        setState(state => ({ ...state, ...res.data }));
      })
      .catch(e => console.log("error:", e));
  }, []);
  // SeatGeek API call to fetch performers coming to a city in a specified time window
  useEffect(() => {
    if (state.token) {
      getPerformers().then(events => {
        setState(prev => ({ ...prev, events }));
      });
    }
  }, [state.token]);
  // Spotify API call to fetch artist details
  useEffect(() => {
    if (state.token && state.events && state.events !== {}) {
      getArtists(state.token, state.events).then(artists => {
        setState(prev => ({ ...prev, artists }));
      });
    }
  }, [state.token, state.events]);

  // fetch artist id with event ids
  useEffect(() => {
    if (state.artists && state.artists !== {}) {
      const artistEvent = {};
      Object.keys(state.artists).map(artist => {
        if (state.artists[artist]) {
          artistEvent[state.artists[artist].id] = state.events[artist];
        }
      });
      setState(prev => ({ ...prev, artistEvent }));
    }
  }, [state.artists]);

  // fetch artist id and song url
  useEffect(() => {
    if (state.token) {
      getSongs(state.token, state.artists).then(res => {
        const { allSongs, songsByGenre, artistSong } = res;
        // setState(prev => ({...prev, songs: {songs, songsByGenre, allGenre }}));
        setState(prev => ({
          ...prev,
          allSongs,
          songsByGenre,
          artistSong
        }));
      });
    }
  }, [state.token, state.events, state.artists]);

  // fetch song id and event id
  useEffect(() => {
    const songEvent = {};
    if (state.artistEvent !== {} && state.artistSong !== {}) {
      for (let artistId in state.artistSong) {
        if (state.artistSong[artistId] && state.artistEvent[artistId]) {
          const uri = state.artistSong[artistId];
          songEvent[uri] = state.artistEvent[artistId];
        }
      }
      setState(prev => ({ ...prev, songEvent }));
    }
  }, [state.artistEvent, state.artistSong]);

  // On Mount, load Spotify Web Playback SDK script
  useEffect(() => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(script);
  }, []);
  // initialize Spotify Web Playback SDK
  useEffect(() => {
    // initialize Spotify Web Playback SDK
    window.onSpotifyWebPlaybackSDKReady = () => {
      // console.log('script loaded');

      const Spotify = window.Spotify;
      const _token = state.token;
      const player = new Spotify.Player({
        name: "Discover Web Playback SDK Player",
        getOAuthToken: callback => {
          callback(_token);
        },
        volume: 0.05
      });
      // add player object to state
      // console.log(player);
      setPlayer(player);

      player.addListener("initialization_error", ({ msg }) =>
        console.error(msg)
      );
      player.addListener("authentication_error", ({ msg }) =>
        console.error(msg)
      );
      player.addListener("account_error", ({ msg }) => console.error(msg));
      player.addListener("playback_error", ({ msg }) => console.error(msg));

      // playback status updates
      player.addListener("player_state_changed", playerState => {
        // console.log("This is the player state", playerState);
        // extract information from current track
        const {
          current_track,
          next_tracks,
          previous_tracks,
          position,
          duration
        } = playerState.track_window;
        const trackName = current_track.name;
        const albumName = current_track.album.name;
        const artistName = current_track.artists.map(artist => artist.name);

        const currentAlbumCover = current_track.album.images[0].url;
        const playing = !playerState.paused;
        // extract information from previous, next tracks
        if (previous_tracks && previous_tracks.length > 0) {
          const prevAlbumCover1 = previous_tracks[1].album.images[0].url;
          const prevAlbumCover2 = previous_tracks[0].album.images[0].url;
          setState(prev => ({
            ...prev,
            prevAlbumCover1,
            prevAlbumCover2
          }));
        }
        if (next_tracks && next_tracks.length > 0) {
          const nextAlbumCover1 = next_tracks[0].album.images[0].url;
          const nextAlbumCover2 = next_tracks[1].album.images[0].url;

          setState(prev => ({
            ...prev,
            nextAlbumCover1,
            nextAlbumCover2
          }));
        }

        setState(prev => ({
          ...prev,
          position,
          duration,
          trackName,
          albumName,
          artistName,
          playing,
          currentAlbumCover
        }));

        //////////////////////////////////////////////////
        const currentTrackUri = current_track.uri;
        setState(prev => ({ ...prev, currentTrackUri }));
      });
      // Ready
      player.addListener("ready", ({ device_id }) => {
        // console.log('Ready with Device ID', device_id);
        setState(prev => ({
          ...prev,
          deviceId: device_id
        }));
      });
      // Not Ready
      player.addListener("not_ready", ({ device_id }) => {
        // console.log('Device ID has gone offline', device_id);
        setState(prev => ({
          ...prev,
          deviceId: null
        }));
      });
      // Connect to the player!
      player.connect().then(success => {
        if (success) {
          // console.log('The Web Playback SDK successfully connected to Spotify!');
        }
      });
    };
  }, [state.token]);

  // fetch song uri with current artist event details
  useEffect(() => {
    if (state.currentTrackUri) {
      if (!state.currentEvent[state.currentTrackUri]) {
        const temp = {
          ...state.currentEvent
        };
        const eventDetails = [];
        for (let event of state.songEvent[state.currentTrackUri]) {
          axios
            .get(
              `https://api.seatgeek.com/2/events/${event}?&client_id=MTk1NDA1NjF8MTU3NDE4NzA5OS41OQ`
            )
            .then(res => {
              eventDetails.push(res.data);
            });
        }
        temp[state.currentTrackUri] = eventDetails;

        setState(prev => ({
          ...prev,
          currentEvent: temp
        }));
      }
    }
  }, [state.currentTrackUri]);

  // Play specific songs on app (device) by default
  useEffect(() => {
    if (state.token && state.deviceId && state.allSongs.length > 0) {
      const allSongs = state.allSongs;

      fetch(
        `https://api.spotify.com/v1/me/player/play/?device_id=${state.deviceId}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${state.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            uris: allSongs
          })
        }
      );
    }
  }, [state.deviceId, state.allSongs]);

  // Repeat user playback
  const repeatPlayback = () => {
    // 'input' can be either a track, context, or off
    // track will repeat the current track
    // context will repeat the current context
    // off will turn repeat off
    fetch(`https://api.spotify.com/v1/me/player/repeat?state=context`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${state.token}`,
        "Content-Type": "application/json"
      }
    });
  };
  // filter by genre helper function
  const filterByGenre = genreStr => {
    const tmp = [...state.currentGenre];

    if (tmp.includes(genreStr)) {
      // if the genre has been selected before, REMOVE it
      console.log(`Removing ${genreStr}`);

      const filteredArr = tmp.filter(genre => genre !== genreStr);

      console.log('currentGenre', filteredArr);

      setState(prev => ({
        ...prev,
        currentGenre: filteredArr
      }));
    } else {
      // if the genre has NOT been selected before, ADD it
      console.log(`Adding ${genreStr}`);

      tmp.push(genreStr);

      console.log('currentGenre', tmp);

      setState(prev => ({
        ...prev,
        currentGenre: tmp
      }));

    }

  };

  // music player control functions
  const handlePrev = () => {
    currentPlayer.previousTrack();
  };
  const handleNext = () => {
    currentPlayer.nextTrack();
  };
  const handleToggle = () => {
    currentPlayer.togglePlay();
  };

  return {
    state,
    currentPlayer,
    handlePrev,
    handleNext,
    handleToggle,
    repeatPlayback,
    filterByGenre
  };
}
