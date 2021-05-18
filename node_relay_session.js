//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');
const NodeCoreUtils = require("./node_core_utils");
const ping = require('tcp-ping');
const RTSPClient = require('rtsp-client');

const EventEmitter = require('events');
const { spawn } = require('child_process');

const RTSP_TRANSPORT = ['udp', 'tcp', 'udp_multicast', 'http'];
const MAX_ALIVE_COUNT = 5;

class NodeRelaySession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.id = NodeCoreUtils.generateNewSessionID();
    this.TAG = 'relay';
    this.timerId = null;
    this.ffmpeg_exec = null;
    this.rtspClient = new RTSPClient();
    this.alive_count = 0;
  }

  async run() {
    let format = this.conf.ouPath.startsWith('rtsp://') ? 'rtsp' : 'flv';
    let argv = ['-i', this.conf.inPath, '-c:v', 'copy', '-c:a', 'aac', '-f', format, this.conf.ouPath];
    if (this.conf.inPath[0] === '/' || this.conf.inPath[1] === ':') {
      argv.unshift('-1');
      argv.unshift('-stream_loop');
      argv.unshift('-re');
    }

    if (this.conf.inPath.startsWith('rtsp://') && this.conf.rtsp_transport) {
      if (RTSP_TRANSPORT.indexOf(this.conf.rtsp_transport) > -1) {
        argv.unshift(this.conf.rtsp_transport);
        argv.unshift('-rtsp_transport');
      }
    }

    if (this.timerId == null) {
      this.timerId = setInterval(() => {
        ping.probe(this.conf.src_ipaddr, this.conf.src_portno, (err, isAlive) => {
          var ip = this.conf.src_ipaddr;
          var msg = isAlive ? 'host ' + ip + ' is alive' : 'host ' + ip + ' is dead';
          //console.log(msg);
          if (isAlive) {
            this.alive_count += 1;
            //console.log(`alive_count = ${this.alive_count}`);
            if (MAX_ALIVE_COUNT <= this.alive_count) {
              this.alive_count = MAX_ALIVE_COUNT;
              this.execFFmpeg(argv);
            }
          }
          else if (isAlive == false || err != undefined) {
            this.alive_count = 0;
            this.end();
          }
        });
      }, 2000);
    }
  }

  execFFmpeg(argv) {
    if (this.ffmpeg_exec != null) {
      return;
    }

    Logger.ffdebug(argv.toString());
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
      this.end();
    });
    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });
    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });
    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Relay end] id=', this.id);
      this.end();
    });
  }

  end() {
    try {
      this.emit('end', this.id);
      if (this.timerId != null) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      if (this.ffmpeg_exec != null) {
        this.ffmpeg_exec.stdin.pause();
        this.ffmpeg_exec.kill('SIGKILL');
        console.log("pid = " + this.ffmpeg_exec.pid);
      }
      Logger.log("session end");
    }
    catch (err) {
      Logger.error(`exception at nodeRelaySession.end(): ${err}`);
    }
  }
}

module.exports = NodeRelaySession;
