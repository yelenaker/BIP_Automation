# BIP Automation

A production-ready Google Apps Script application that automates the processing of Erasmus+ Blended Intensive Programme (BIP) invitation emails.

The system continuously monitors a Gmail inbox, extracts structured information using Google's Gemini AI, stores the results in Google Sheets, manages Google Drive folders, and automatically notifies faculty coordinators.

---

## Features

### Gmail Automation

- Automatically scans Gmail for new BIP invitation emails
- Configurable Gmail search query
- Prevents duplicate processing
- Manual and scheduled execution

### AI Extraction

- Google Gemini integration
- Automatic extraction of:
  - university
  - country
  - programme
  - academic level
  - application deadline
  - mobility dates
  - contacts
  - funding information
  - website
  - application link
  - additional notes

### Spreadsheet Management

- Google Sheets used as the central database
- Automatic record creation
- Duplicate detection
- Dashboard statistics
- Decision tracking

### Google Drive Integration

- Automatically creates a folder for every imported BIP
- Archives original invitation emails
- Stores supporting documents

### Notification System

- Sends notification emails to faculty coordinators
- Configurable reminder interval
- Automatic follow-up reminders
- Administrator notifications

### Scheduling

- Daily automated imports
- Configurable execution time
- Configurable reminder execution time
- Automatic trigger management
- Manual execution from the dashboard

### Administration Dashboard

- Modern responsive interface
- Live statistics
- Configuration management
- Trigger management
- Gemini connection testing
- Activity log
- System status monitoring

---

# Architecture

```
Gmail
   │
   ▼
AutomationService
   │
   ▼
GeminiService
   │
   ▼
ParserService
   │
   ▼
SpreadsheetService
   │
   ├────────► NotificationService
   │
   └────────► DriveService
```

---

## Project Structure

```
Config.gs
Constants.gs
Utilities.gs

Router.gs

AutomationService.gs
TriggerService.gs
SpreadsheetService.gs
ParserService.gs
GeminiService.gs
NotificationService.gs
DriveService.gs
HomeService.gs

Index.html
```

---

# Technology Stack

- Google Apps Script (V8)
- Google Sheets API
- Gmail Service
- Google Drive Service
- Google Gemini API
- HTML5
- CSS3
- Vanilla JavaScript (ES6)

---

# Scheduling

The application uses Google Apps Script Time-driven Triggers.

Features include:

- configurable import time
- configurable reminder time
- automatic trigger recreation
- trigger cleanup
- manual execution
- duplicate trigger protection

---

# Configuration

The application is configured entirely through Script Properties.

Example configuration:

| Property | Description |
|----------|-------------|
| SPREADSHEET_ID | Main Google Spreadsheet |
| DRIVE_ROOT_FOLDER_ID | Root Drive folder |
| GEMINI_API_KEY | Gemini API key |
| GEMINI_MODEL | Gemini model |
| GMAIL_SEARCH_QUERY | Gmail search query |
| IMPORT_TRIGGER_HOUR | Daily import hour |
| REMINDER_TRIGGER_HOUR | Reminder hour |
| REMINDER_INTERVAL_DAYS | Days between reminders |
| TIMEZONE | Project timezone |
| ADMIN_ALERT_EMAIL | Administrator email |
| NOTIFICATION_SENDER_NAME | Sender display name |

---

# Dashboard

The administration dashboard provides:

- Live system status
- Import statistics
- Configuration management
- Trigger scheduling
- Reminder settings
- Notification settings
- Gemini connection testing
- Manual import
- Manual reminder execution
- Activity log

---

# Workflow

```
Scheduled Trigger
        │
        ▼
Import Gmail
        │
        ▼
Duplicate Check
        │
        ▼
Gemini Extraction
        │
        ▼
Parse Response
        │
        ▼
Save to Spreadsheet
        │
        ▼
Create Drive Folder
        │
        ▼
Send Notifications
```

---

# Error Handling

The project includes:

- structured logging
- configuration validation
- duplicate detection
- cache invalidation
- lock protection
- graceful recovery
- retry-safe scheduling

---

# Security

- Script Properties for secrets
- Hidden API keys
- Input validation
- JSON validation
- Google Apps Script LockService
- CacheService optimisation

---

# Author

Developed for the International Office of the Slovak University of Technology (STU).

Built to automate the Erasmus+ Blended Intensive Programme invitation workflow.

# BIP Automation

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-V8-blue)
![Google Sheets](https://img.shields.io/badge/Google-Sheets-green)
![Gemini AI](https://img.shields.io/badge/Google-Gemini-orange)
![Status](https://img.shields.io/badge/status-production-success)
![License](https://img.shields.io/badge/license-MIT-blue)