# TDC Project

실시간 워크 스페이스 생성형 일정 관리 및 애플리케이션으로, Spring Boot 백엔드와 React 프론트엔드로 구성되어 있습니다.

## 기술 스택

### 프론트엔드
- React 19
- TypeScript
- Redux Toolkit
- React Router
- SockJS + STOMP
- Axios

### 백엔드
- Spring Boot 3.5.0
- Spring Security
- Spring Data JPA
- Spring WebSocket
- JWT 인증
- MySQL / H2 Database

## 로컬 개발 환경 설정

### 맥OS
```bash
# 백엔드 서버 실행
cd /Users/hyunki/TDC/back
./mvnw spring-boot:run

# 프론트엔드 서버 실행
cd /Users/hyunki/TDC/front
npm start
```

### Windows
```bash
# 백엔드 서버 실행
cd C:\경로\TDC\back
.\mvnw.cmd spring-boot:run

# 프론트엔드 서버 실행
cd C:\경로\TDC\front
npm start
```

### H2 데이터베이스 콘솔
- URL: http://localhost:8080/h2-console
- 사용자명: sa
- 비밀번호: (비어 있음)
- JDBC URL: jdbc:h2:mem:chatdb

## 포트 정보
- 백엔드: 8080
- 프론트엔드: 3000

## 배포 정보

### 프론트엔드
- 배포 URL: https://hyunki.github.io/TDC/
- 배포 방법: GitHub Pages

### 백엔드
- 배포 플랫폼: Render
- 배포 방법은 [DEPLOY.md](./DEPLOY.md) 문서를 참조하세요.

## 주요 기능
- 사용자 인증 (회원가입, 로그인, 소셜 로그인)
- 워크스페이스 생성 및 관리
- 채팅방 생성 및 실시간 채팅
- 파일 업로드/다운로드
- 사용자 상태 표시 (온라인/오프라인) (구현 중)

## 개발자
- [윤현기,최지태](https://github.com/hyunki)

## 라이센스
이 프로젝트는 MIT 라이센스를 따릅니다. 
