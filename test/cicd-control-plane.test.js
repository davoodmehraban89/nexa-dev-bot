import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateDeliveryState } from '../src/core/cicd-control-plane.js';

const sha='a'.repeat(40);
const active={deployment:{id:'dep',versions:[{versionId:'v1',percentage:100}]}};

test('CP5 correlates exact SHA across CI and deploy before declaring success',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:active}).state,'success');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha:'b'.repeat(40),status:'completed',conclusion:'success'},runtime:active}).state,'mismatch');
});

test('CP5 never promotes pending, failed, or missing evidence to success',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'in_progress'},deploy:{sha,status:'queued'},runtime:active}).state,'pending');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'failure'},deploy:{sha,status:'completed',conclusion:'success'},runtime:active}).state,'failed');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:null,deploy:null,runtime:null}).state,'unknown');
});

test('CP5 flags runtime traffic that is absent or split as mismatch',()=>{
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:{deployment:null}}).state,'mismatch');
  assert.equal(correlateDeliveryState({targetSha:sha,ci:{sha,status:'completed',conclusion:'success'},deploy:{sha,status:'completed',conclusion:'success'},runtime:{deployment:{versions:[{versionId:'v1',percentage:50},{versionId:'v2',percentage:50}]}}}).state,'mismatch');
});
