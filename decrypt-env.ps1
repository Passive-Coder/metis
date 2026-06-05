param(
  [string]$InputFile = ".env.enc",
  [string]$OutputFile = ".env"
)

$envKey = $env:ENV_KEY
if ([string]::IsNullOrEmpty($envKey)) {
  $secure = Read-Host -Prompt "Enter decryption key" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $envKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:ENV_KEY = $envKey
$env:ENV_IN = $InputFile
$env:ENV_OUT = $OutputFile

node -e "const fs=require('fs');const crypto=require('crypto');try{const pass=process.env.ENV_KEY||'';if(!pass){throw new Error('Missing ENV_KEY');}const raw=fs.readFileSync(process.env.ENV_IN,'utf8').trim();const parts=raw.split(':');if(parts.length!==4){throw new Error('Invalid encrypted file format');}const [saltB64,ivB64,tagB64,encB64]=parts;const salt=Buffer.from(saltB64,'base64');const iv=Buffer.from(ivB64,'base64');const tag=Buffer.from(tagB64,'base64');const enc=Buffer.from(encB64,'base64');const key=crypto.pbkdf2Sync(pass,salt,100000,32,'sha256');const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);const dec=Buffer.concat([decipher.update(enc),decipher.final()]);if(dec.length===0){throw new Error('Decrypted output is empty');}fs.writeFileSync(process.env.ENV_OUT,dec);console.log('Decrypted to',process.env.ENV_OUT,'bytes',dec.length);}catch(err){console.error('Decryption failed:',err.message);process.exit(1);}" 