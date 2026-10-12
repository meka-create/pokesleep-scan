#!/usr/bin/env python3
"""Same-repo verified update-health publisher, including failed scheduled runs."""
import argparse,datetime,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
def create(state,run_id,now=None):
    if state not in ('success','failure'):raise ValueError('unknown job status')
    if not re.fullmatch(r'\d{1,20}',str(run_id)):raise ValueError('invalid run id')
    now=now or datetime.datetime.now(datetime.timezone.utc)
    return {'schemaVersion':'pokesleep-ocr-master-status-v1',
            'state':'healthy' if state=='success' else 'attention',
            'createdAt':None,
            'checkedAt':now.astimezone(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),
            'reasonCode':'VERIFIED' if state=='success' else 'DAILY_UPDATE_FAILED',
            'runId':str(run_id)}
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--state',required=True,choices=['success','failure'])
    p.add_argument('--run-id',required=True)
    p.add_argument('--root',type=pathlib.Path,default=ROOT)
    a=p.parse_args()
    output=create(a.state,a.run_id)
    (a.root/'master-update-status.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('health state:',output['state'])
if __name__=='__main__':main()
