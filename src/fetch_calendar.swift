import EventKit

let eventStore = EKEventStore()
let now = Date()
let endDate = Calendar.current.date(byAdding: .day, value: 1, to: now)!

// 명령줄 인자 파싱: --list-calendars가 있으면 캘린더 목록만 출력
var targetCalendars: Set<String> = []
if let fetchCalendarsArg = CommandLine.arguments.first(where: { $0.hasPrefix("--fetch-calendars=") }) {
    let value = fetchCalendarsArg.replacingOccurrences(of: "--fetch-calendars=", with: "")
    let names = value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    targetCalendars = Set(names)
}


// macOS 14 이상에서는 requestFullAccessToEventsWithCompletion 사용
func requestCalendarAccess(completion: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        eventStore.requestFullAccessToEvents { granted, error in
            completion(granted && error == nil)
        }
    } else {
        eventStore.requestAccess(to: .event) { granted, error in
            completion(granted && error == nil)
        }
    }
}

// 명령줄 인자 파싱: --list-calendars가 있으면 캘린더 목록만 출력
if CommandLine.arguments.contains("--list-calendars") {
    requestCalendarAccess { granted in
        guard granted else {
            print("-1")
            exit(1)
        }
        let calendars = eventStore.calendars(for: .event)
        let calendarNames = calendars.map { $0.title }
        if let jsonData = try? JSONSerialization.data(withJSONObject: calendarNames, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        } else {
            print("{\"error\": \"JSON 변환 오류\"}")
        }
        exit(0)
    }
    RunLoop.main.run()
} else if CommandLine.arguments.contains(where: { $0.hasPrefix("--fetch-calendars=") }) {
    // 특정 문자열("zoom")이 포함된 일정만 필터링
    func containsZoom(text: String?) -> Bool {
        guard let text = text?.lowercased() else { return false }
        return text.contains("zoom") || text.contains("https://zoom.us") || text.contains("zoommtg://")
    }

    // 시스템 로케일에 맞춘 날짜 포맷 변환
    func formatDateToLocalString(date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss ZZZ"
        formatter.locale = Locale.current
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    // Zoom 링크를 추출하는 함수 (http로 시작하고 zoom.us 도메인이 포함된 URL 찾기)
    func extractZoomLink(from text: String?) -> String? {
        guard let text = text else { return nil }

        let pattern = #"https?://\S*zoom\.us\S*"#
        let regex = try? NSRegularExpression(pattern: pattern, options: [])

        if let match = regex?.firstMatch(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count)) {
            if let range = Range(match.range, in: text) {
                return String(text[range])
            }
        }

        return nil
    }

    // 캘린더 접근 권한 요청 및 데이터 가져오기
    requestCalendarAccess { granted in
        guard granted else {
            print("-1")
            exit(1)
        }

        // ✅ 특정 캘린더 필터링
        let calendars = eventStore.calendars(for: .event).filter { targetCalendars.contains($0.title) }

        let predicate = eventStore.predicateForEvents(withStart: now, end: endDate, calendars: calendars)
        let events = eventStore.events(matching: predicate)

        var filteredEvents: [[String: Any]] = []
        
        for event in events {
            let title = event.title ?? "제목 없음"
            let startDate = event.startDate ?? now
            let endDate = event.endDate ?? now
            let location = event.location ?? ""
            let notes = event.notes ?? ""
            // 참석자 정보 추출
            var attendees: [String] = []
            if let eventAttendees = event.attendees {
                for attendee in eventAttendees {
                    if let name = attendee.name, !name.isEmpty {
                        attendees.append(name)
                    } else {
                        let urlString = attendee.url.absoluteString
                        if urlString.hasPrefix("mailto:") {
                            let email = String(urlString.dropFirst("mailto:".count))
                            if !email.isEmpty {
                                attendees.append(email)
                            }
                        } else if !urlString.isEmpty {
                            attendees.append(urlString)
                        }
                    }
                }
            }
            // Zoom 키워드가 포함된 일정만 필터링
            //if containsZoom(text: title) || containsZoom(text: location) || containsZoom(text: notes) {
                let zoomLink = extractZoomLink(from: notes) ?? extractZoomLink(from: location) ?? ""

                let eventData: [String: Any] = [
                    "title": title,
                    "start": formatDateToLocalString(date: startDate),
                    "end": formatDateToLocalString(date: endDate),
                    "description": notes,
                    "location": location,
                    "zoom_link": zoomLink,
                    "attendees": attendees
                ]
                filteredEvents.append(eventData)
            //}
        }

        // JSON 변환 후 출력
        if let jsonData = try? JSONSerialization.data(withJSONObject: filteredEvents, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        } else {
            print("{\"error\": \"JSON 변환 오류\"}")
        }

        exit(0) // 정상적으로 실행 완료 후 종료
    }

    // 비동기 실행을 위해 약간의 대기 필요
    RunLoop.main.run()
} else {
    // 인자가 없으면 아무 동작도 하지 않고 종료
    print("No valid argument provided. Use --list-calendars or --fetch-calendars.")
    exit(0)
}
