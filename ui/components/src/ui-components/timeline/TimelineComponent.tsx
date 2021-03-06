/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import classnames from "classnames";
import { PlayerButton, PlayButton } from "./PlayerButton";
import { Position } from "@bentley/ui-core";
import { Milestone, PlaybackSettings } from "./interfaces";
import { Timeline } from "./Timeline";
import { Scrubber } from "./Scrubber";
import { InlineEdit } from "./InlineEdit";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { UiComponents } from "../UiComponents";
import "./TimelineComponent.scss";

/** @alpha */
interface TimelineComponentProps {
  startDate?: Date; // start date
  endDate?: Date;   // end date
  totalDuration: number;  // total duration in milliseconds
  initialDuration?: number;  // initial value for current duration in milliseconds
  milestones?: Milestone[]; // optional milestones
  minimized?: boolean;  // show in minimized mode
  repeat?: boolean;  // repeat animation indefinitely
  onChange?: (duration: number) => void; // callback with current value (as a fraction)
  onPlayPause?: (playing: boolean) => void; // callback triggered when play/pause button is pressed
  onJump?: (forward: boolean) => void; // callback triggered when backward/forward buttons are pressed
  onSettingsChange?: (arg: PlaybackSettings) => void; // callback triggered when settings is changed
}

/** @alpha */
interface TimelineComponentState {
  isSettingsOpen: boolean; // settings popup is opened or closed
  isPlaying: boolean; // timeline is currently playing or paused
  minimized?: boolean; // minimized mode
  currentDuration: number; // current duration in milliseconds
  totalDuration: number;  // total duration in milliseconds
  repeat: boolean; // automatically restart when the timeline is finished playing
}

/** Component used to playback timeline data
 * @alpha
 */
export class TimelineComponent extends React.PureComponent<TimelineComponentProps, TimelineComponentState> {
  private _timeLastCycle = 0;
  private _requestFrame = 0;
  private _unmounted = false;
  private _settings: HTMLElement | null = null;
  private _expandLabel: string = "Expand";
  private _minimizeLabel: string = "Minimize";
  private _repeatLabel: string = "Repeat";

  constructor(props: TimelineComponentProps) {
    super(props);

    this.state = {
      isSettingsOpen: false,
      isPlaying: false,
      minimized: this.props.minimized,
      currentDuration: props.initialDuration ? props.initialDuration : 0,
      totalDuration: this.props.totalDuration,
      repeat: this.props.repeat ? true : false,
    };

    this._expandLabel = UiComponents.i18n.translate("UiComponents:timeline.expand");
    this._minimizeLabel = UiComponents.i18n.translate("UiComponents:timeline.minimize");
    this._repeatLabel = UiComponents.i18n.translate("UiComponents:timeline.repeat");
  }

  public componentWillUnmount() {
    window.cancelAnimationFrame(this._requestFrame);
    this._unmounted = true;
  }

  // user clicked backward button
  private _onBackward = () => {
    // istanbul ignore else
    if (this.props.onJump)
      this.props.onJump(false);
  }

  // user clicked forward button
  private _onForward = () => {
    // istanbul ignore else
    if (this.props.onJump)
      this.props.onJump(true);
  }

  // user clicked play button
  private _onPlay = () => {
    // istanbul ignore if
    if (this.state.isPlaying)
      return;

    // timeline was complete, restart from the beginning
    if (this.state.currentDuration >= this.state.totalDuration) {
      this._replay();
    } else
      this._play();

    // istanbul ignore else
    if (this.props.onPlayPause)
      this.props.onPlayPause(true);
  }

  // user clicked pause button
  private _onPause = () => {
    // istanbul ignore if
    if (!this.state.isPlaying)
      return;

    // stop requesting frames
    window.cancelAnimationFrame(this._requestFrame);

    // stop playing
    this.setState({ isPlaying: false });

    // istanbul ignore else
    if (this.props.onPlayPause)
      this.props.onPlayPause(false);
  }

  // user clicked on timeline rail or dragged scrubber handle
  private _onTimelineChange = (values: ReadonlyArray<number>) => {
    const currentDuration = values[0];
    this._setDuration(currentDuration);
  }

  // set the current duration, which will call the OnChange callback
  private _setDuration = (currentDuration: number) => {
    this._timeLastCycle = new Date().getTime();
    this.setState({ currentDuration });
    // istanbul ignore else
    if (this.props.onChange) {
      const fraction = currentDuration / this.state.totalDuration;
      this.props.onChange(fraction);
    }
  }

  // recursively update the animation until we hit the end or the pause button is clicked
  private _updateAnimation = (_timestamp: number) => {
    // istanbul ignore else
    if (!this.state.isPlaying && !this._unmounted) {
      return;
    }

    // update duration
    const currentTime = new Date().getTime();
    const millisecondsElapsed = currentTime - this._timeLastCycle;
    const duration = this.state.currentDuration + millisecondsElapsed;
    this._setDuration(duration);

    // stop the animation!
    if (duration >= this.state.totalDuration) {
      window.cancelAnimationFrame(this._requestFrame);
      this.setState({ isPlaying: false });
      if (this.state.repeat)
        this._replay();
      else {
        // istanbul ignore else
        if (this.props.onPlayPause)
          this.props.onPlayPause(false);
      }

      return;
    }

    // continue the animation - request the next frame
    this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
  }

  private _play() {
    // start playing
    this.setState({ isPlaying: true }, () => {
      // request the next frame
      this._timeLastCycle = new Date().getTime();
      this._requestFrame = window.requestAnimationFrame(this._updateAnimation);
    });
  }

  private _replay = () => {
    // timeline was complete, restart from the beginning
    this.setState({ currentDuration: 0 }, (() => this._play()));
  }

  private _displayTime(millisec: number) {
    const addZero = (i: number) => {
      return (i < 10) ? "0" + i : i;
    };

    const date = new Date(millisec);
    // const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${addZero(minutes)}:${addZero(seconds)}`;
  }

  private _getMilliseconds(time: string) {
    if (time.indexOf(":") !== -1) {
      return (Number(time.split(":")[0]) * 60 + Number(time.split(":")[1])) * 1000;
    } else {
      return Number(time) * 1000;
    }
  }

  // user changed the total duration
  private _onTotalDurationChange = (value: string) => {
    // NOTE: we should reset the current duration to 0
    const milliseconds = this._getMilliseconds(value);
    this.setState({ totalDuration: milliseconds }, () => {
      if (this.props.onSettingsChange) {
        this.props.onSettingsChange({ duration: this.state.totalDuration });
      }
    });
  }

  private _onSettingsClick = () => {
    this.setState({ isSettingsOpen: !this.state.isSettingsOpen });
  }

  private _onCloseSettings = () => {
    this.setState({ isSettingsOpen: false });
  }

  private _onModeChanged = () => {
    this.setState({ minimized: !this.state.minimized, isSettingsOpen: false }, () => {
      if (this.props.onSettingsChange) {
        this.props.onSettingsChange({ minimized: this.state.minimized });
      }
    });
  }

  private _onRepeatChanged = () => {
    this.setState({ repeat: !this.state.repeat, isSettingsOpen: false }, () => {
      if (this.props.onSettingsChange) {
        this.props.onSettingsChange({ loop: this.state.repeat });
      }
    });
  }

  private _currentDate = (): Date => {
    const fraction = this.state.currentDuration / this.state.totalDuration;
    if (this.props.endDate && this.props.startDate) {
      const timeElapsed = (this.props.endDate.getTime() - this.props.startDate.getTime()) * fraction;
      return new Date(this.props.startDate.getTime() + timeElapsed);
    }
    return new Date();
  }

  private _renderSettings = () => {
    const expandName = (this.state.minimized) ? this._expandLabel : this._minimizeLabel;
    const hasDates = this.props.startDate && this.props.endDate;
    return (
      <>
        <span data-testid="timeline-settings" className="timeline-settings icon icon-more-vertical-2" ref={(element) => this._settings = element} onClick={this._onSettingsClick} ></span>
        <ContextMenu parent={this._settings} isOpened={this.state.isSettingsOpen} onClickOutside={this._onCloseSettings.bind(this)} position={Position.BottomRight}>
          {hasDates && <ContextMenuItem name={expandName} onClick={this._onModeChanged} />}
          <ContextMenuItem name={this._repeatLabel} checked={this.state.repeat} onClick={this._onRepeatChanged} />
        </ContextMenu>
      </>
    );
  }

  public render() {
    const { startDate, endDate, milestones } = this.props;
    const { currentDuration, totalDuration, minimized } = this.state;
    const currentDate = this._currentDate();
    const durationString = this._displayTime(currentDuration);
    const totalDurationString = this._displayTime(totalDuration);
    const hasDates = startDate && endDate;
    const miniMode = minimized || !hasDates;

    return (
      <div className={classnames("timeline-component", miniMode && "minimized", hasDates && "has-dates")}>
        <div className="header">
          <PlayButton className="play-button" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <PlayerButton className="play-backward" icon="icon-caret-left" onClick={this._onBackward} />
          <PlayerButton className="play-button-step" icon="icon-media-controls-circular-play" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <PlayerButton className="play-forward" icon="icon-caret-right" onClick={this._onForward} />
          <span className="current-date">{currentDate.toLocaleDateString()}</span>
          {!miniMode && this._renderSettings()}
        </div>
        {!miniMode && <Timeline
          className="timeline-timeline"
          startDate={startDate!}
          endDate={endDate!}
          selectedDate={currentDate}
          milestones={milestones}
          isPlaying={this.state.isPlaying}
        />}
        <div className="scrubber">
          <PlayButton className="play-button" isPlaying={this.state.isPlaying} onPlay={this._onPlay} onPause={this._onPause} />
          <div className="start-time-container">
            {hasDates && <span className="start-date">{startDate!.toLocaleDateString()}</span>}
            <span className="start-time">{durationString}</span>
          </div>
          <Scrubber
            className="slider"
            currentDuration={this.state.currentDuration}
            totalDuration={totalDuration}
            startDate={startDate}
            endDate={endDate}
            isPlaying={this.state.isPlaying}
            inMiniMode={miniMode}
            onChange={this._onTimelineChange}
            onUpdate={this._onTimelineChange}
          />
          <div className="end-time-container">
            {hasDates && <span className="end-date">{endDate!.toLocaleDateString()}</span>}
            <InlineEdit className="end-time" defaultValue={totalDurationString} onChange={this._onTotalDurationChange} />
          </div>
          {miniMode && this._renderSettings()}
        </div>
      </div>
    );
  }
}
