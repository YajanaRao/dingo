import TrackPlayer from 'react-native-track-player';
import utils from '../Utils/utils';
import BackgroundTimer from 'react-native-background-timer';
import ytdl from 'react-native-ytdl';
import { database } from '../Database/database';

const previousPlayingTrack = { title: '', artist: '', artwork: '' };
let trackCurrent = { id: '', title: '', artist: '', artwork: '' };
module.exports = async data => {
	_updateTrackPlayerQueueItem = (tracks, track, newProperties, callback) => {
		const currentItemIndex = utils.getIndexOfTrackUsingId(tracks, track.id);

		track = {
			...track,
			...newProperties,
		};

		globals.shouldUIRespondToEvents = false;

		if (track.id === trackCurrent.id) {
			mutableTracks = [...tracks];
			mutableTracks[currentItemIndex] = track;

			TrackPlayer.reset();

			TrackPlayer.add(mutableTracks).then(() => {
				TrackPlayer.skip(track.id).then(() => {
					callback();
					globals.shouldUIRespondToEvents = true;
				});
			});
		} else {
			insertBeforeId = null;
			if (currentItemIndex + 1 < tracks.length) insertBeforeId = tracks[currentItemIndex + 1].id;

			TrackPlayer.remove(track.id)
				.then(() => {
					TrackPlayer.add(track, insertBeforeId).then(() => {
						callback();
						globals.shouldUIRespondToEvents = true;
					});
				})
				.catch(e => console.error(e));
		}
	};

	_getTracksToRight = (tracks, currentIndex, howManyToTheRight) => {
		return tracks.slice(currentIndex + 1, currentIndex + 1 + howManyToTheRight);
	};
	_getTracksToLeft = (tracks, currentIndex, howManyToTheLeft) => {
		return tracks.slice(currentIndex - howManyToTheLeft, currentIndex);
	};
	_filterHighestQualityAudio = formats => {
		let audioFormats = ytdl.filterFormats(formats, 'audioonly');

		let highestFormat = audioFormats[0];
		audioFormats.map(item => {
			if (highestFormat.audioBitrate < item.audioBitrate) highestFormat = item;
		});
		const highestQualityAudio = highestFormat.url;

		return highestQualityAudio;
	};
	_ytdlGetInfo = (videoId, callback, errCallback) => {
		ytdl.getInfo(videoId, {}, (err, info) => {
			if (err) errCallback(err);
			callback(info);
		});
	};
	_getHighestQualityAudioUsingYtdl = (videoId, callback, errCallback) => {
		_ytdlGetInfo(
			videoId,
			info => {
				const highestQualityAudio = _filterHighestQualityAudio(info.formats);
				callback(highestQualityAudio);
			},
			err => errCallback(err)
		);
	};

	_fetchURLs = (
		shouldFetchCurrent,
		amountOfTracksToLeft,
		amountOfTracksToRight,
		afterCurrentFetched,
		cbFinally
	) => {
		TrackPlayer.getQueue()
			.then(tracks => {
				TrackPlayer.getCurrentTrack().then(currentTrackId => {
					const currentItemIndex = utils.getIndexOfTrackUsingId(tracks, currentTrackId);

					const tracksToLeft = this._getTracksToLeft(tracks, currentItemIndex, amountOfTracksToLeft);
					trackCurrent = tracks[currentItemIndex];
					const tracksToRight = this._getTracksToRight(tracks, currentItemIndex, amountOfTracksToRight);

					[shouldFetchCurrent ? trackCurrent : {}, ...tracksToRight, ...tracksToLeft].map((item, index) => {
						if (item.videoId && ytdl.validateID(item.videoId)) {
							this._ytdlGetInfo(
								item.videoId,
								info => {
									console.log(JSON.stringify(info));
									const highestQualityAudio = this._filterHighestQualityAudio(info.formats);

									this._updateTrackPlayerQueueItem(
										tracks,
										item,
										{
											url: highestQualityAudio,

											title: info.title,
											artist: info.author.name,
											artwork: info.thumbnail_url,
										},
										() => {
											if (shouldFetchCurrent && index === 0) {
												afterCurrentFetched();
												cbFinally();
											}
										}
									);
								},
								err => {
									cbFinally();
									console.error(err);
								}
							);
						} else if (!item.url || item.url.length <= 'http://'.length) {
							if (item.title && item.artist) {
								utils.fetchFromEndpoint(
									`getHighestQualityAudioUsingArtistAndSong?artist=${encodeURIComponent(
										item.artist
									)}&song=${encodeURIComponent(item.title)}`,
									response => {
									
										_getHighestQualityAudioUsingYtdl(
											response.videoId,
											highestQualityAudio =>{

												this._updateTrackPlayerQueueItem(
													tracks,
													item,
													{
														url: highestQualityAudio,
													},
													() => {
														if (shouldFetchCurrent && index === 0)
															afterCurrentFetched();
													}
												)
												cbFinally();
											},
											err => {
												console.error(err);
												cbFinally();
											}
										);
									}
								);
							}
						}
					});
				});
			})
			.catch(e => console.error(e));
	};

	writeRecentTrack = (timestamp, trackName, artistName, image, youtube_id) => {
		database.insertRecentTrack(timestamp, trackName, artistName, image, youtube_id).catch(e => console.error(e));
	};

	//use this to save listened tracks into files
	console.log('data.type: ' + data.type);

	if (data.type == 'playback-error' && data.code == 'playback-source') {
		globals.isFetchingURL = true;
		_fetchURLs(true, 0, 0, () => TrackPlayer.play(), () => (globals.isFetchingURL = false));
	}

	if (data.type == 'playback-state') {
		// Update the UI with the new state
		console.log(JSON.stringify(data));

		if (data.state == TrackPlayer.STATE_NONE) {
			console.log('STATE_NONE');
		}
		if (data.state == TrackPlayer.STATE_PLAYING) {
			console.log('STATE_PLAYING');
			TrackPlayer.getCurrentTrack().then(currentTrackId => {
				TrackPlayer.getTrack(currentTrackId).then(track => {
					if (
						previousPlayingTrack.title !== track.title ||
						previousPlayingTrack.artist !== track.artist ||
						previousPlayingTrack.artwork !== track.artwork
					) {
						this.writeRecentTrack(
							new Date().getTime(),
							track.title,
							track.artist,
							track.artwork,
							track.videoId
						);
					}

					previousPlayingTrack.title = track.title;
					previousPlayingTrack.artist = track.artist;
					previousPlayingTrack.artwork = track.artwork;
				});
			});
		}
		if (data.state == TrackPlayer.STATE_PAUSED) {
			console.log('STATE_PAUSED');
		}
		if (data.state == TrackPlayer.STATE_STOPPED) {
			console.log('STATE_STOPPED');
		}
		if (data.state == TrackPlayer.STATE_BUFFERING) {
			console.log('STATE_BUFFERING');
			_fetchURLs(false, 1, 1, () => {}, () => {});
		}
	} else if (data.type == 'remote-play') {
		TrackPlayer.play();
	} else if (data.type == 'remote-pause') {
		TrackPlayer.pause();
	} else if (data.type == 'remote-next') {
		TrackPlayer.skipToNext();
	} else if (data.type == 'remote-previous') {
		TrackPlayer.skipToPrevious();
	} else if (data.type == 'remote-seek') {
		TrackPlayer.seekTo(data.position);
	} else if (data.type == 'remote-duck') {
		if (data.paused) TrackPlayer.pause();
		if (data.permanent) TrackPlayer.stop();
		if (data.ducking) {
			const prevVolume = await TrackPlayer.getVolume();
			TrackPlayer.setVolume(0.1);

			BackgroundTimer.setTimeout(() => {
				TrackPlayer.setVolume(prevVolume);
			}, 3 * 1000);
		}
	}
};
