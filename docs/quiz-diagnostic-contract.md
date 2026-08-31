# Quiz diagnostic integration contract

This service creates a `QuizDiagnosticRequest` when a student marks a concept
as `needs_help`. It does not call the Quiz microservice yet. A future gateway,
message broker, or scheduled outbox worker should deliver records whose status
is `pending_integration`.

## Request payload for the Quiz service

```json
{
  "requestId": "MongoDB request id",
  "userId": "Clerk user id",
  "source": "smart-handwritten-note-service",
  "purpose": "diagnostic",
  "noteId": "source note id",
  "subject": "Science",
  "grade": 10,
  "lessonId": "sci-g10-motion-in-a-straight-line",
  "lessonName": "Motion in a Straight Line",
  "concept": {
    "id": "sci-g10-mot-004",
    "name": "Velocity",
    "weight": 5
  },
  "requestedQuestionCount": 5
}
```

## Expected response from the Quiz service

```json
{
  "requestId": "MongoDB request id",
  "status": "created",
  "quizId": "quiz-service id",
  "launchPath": "/quiz/quiz-session?quizId=..."
}
```

The integration worker should then mark the local request as `sent`,
`completed`, or `failed`. The Quiz service should remain responsible for quiz
generation, answers, scoring, and diagnostic result calculation.
