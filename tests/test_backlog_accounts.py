"""A real standalone import must not replace existing account snapshots."""
import hashlib,json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class AccountImportTest(unittest.TestCase):
 def test_import_preserves_existing_accounts(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'site'
   subprocess.run(['git','clone','--quiet','--local',str(ROOT),str(root)],check=True)
   for f in ('app.arc','backlog.arc','scripts/backlog-import.mjs'):
    shutil.copy2(ROOT/f,root/f)
   def arc(program):
    return subprocess.run(['./sharc'],cwd=root,input=program,text=True,capture_output=True,check=True)
   arc('(load "news.arc")\n(ensure-newsdirs)\n(load-userinfo)\n(create-acct "persistuser" "regression-password-only")\n(init-user "persistuser")\n(ensure-market-backlog)\n')
   paths=[root/'arc'/f for f in ('hpw','uids','max-uid','cooks')]
   before={p.name:p.read_bytes() if p.exists() else None for p in paths}
   batch=root/'test-batch.json';batch.write_text(json.dumps([dict(title='Account persistence regression article',url='https://example.com/persistence-test',source='Test')]))
   subprocess.run(['node','scripts/backlog-import.mjs',str(batch)],cwd=root,text=True,capture_output=True,check=True)
   self.assertEqual(before,{p.name:p.read_bytes() if p.exists() else None for p in paths})
   result=arc('(load "news.arc")\n(load-userinfo)\n(prn (check-pw "persistuser" "regression-password-only"))\n')
   self.assertIn('T',result.stdout.splitlines())
   result=arc('(load \"news.arc\")\n(load-userinfo)\n(prn (good-login \"PERSISTUSER\" \"regression-password-only\" \"127.0.0.1\"))\n')
   self.assertIn('persistuser',result.stdout.splitlines())
if __name__=='__main__':unittest.main()
