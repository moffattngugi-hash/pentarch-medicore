@echo off
title Pentarch MediCore
cd /d %~dp0
if not exist node_modules (
  echo First run: installing and building. This takes a few minutes...
  call npm run setup
)
start "" http://localhost:4000
npm start
