# hub-static

`npm run generate-hub`가 만드는 `generated-hub/`는 실행할 때마다 새로 만들어지므로, 그 안에 직접
넣어둔 파일(예: Search Console HTML 파일 인증용 `googleXXXXXXXXXXXXXXXX.html`)은 다음 생성 때
사라집니다. 이 폴더(`hub-static/`)에 넣어둔 파일은 매 생성 시 `generated-hub/`로 그대로 복사되므로,
git에 커밋해두면 GitHub Actions 자동 배포에서도 계속 유지됩니다.

예: Google이 내려준 인증 파일을 여기 그대로 저장

```
hub-static/google1234567890abcdef.html
```
