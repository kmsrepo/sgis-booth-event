package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ResponseRecord represents a single participant quiz response
type ResponseRecord struct {
	ID          int    `json:"id"`
	CreatedAt   string `json:"created_at"`
	Q1Answer    string `json:"q1_answer"`
	IsQ1Correct int    `json:"is_q1_correct"`
	Q2Answer    string `json:"q2_answer"`
	IsQ2Correct int    `json:"is_q2_correct"`
	Q3Answer    string `json:"q3_answer"`
	IsQ3Correct int    `json:"is_q3_correct"`
	Q4Answer    string `json:"q4_answer"`
	IsQ4Correct int    `json:"is_q4_correct"`
	Q5Feedback  string `json:"q5_feedback"`
	Score       int    `json:"score"`
	UserAgent   string `json:"user_agent"`
	IPAddress   string `json:"ip_address"`
}

// StatsSummary represents real-time KPI statistics
type StatsSummary struct {
	TotalResponses int     `json:"total_responses"`
	PerfectScores  int     `json:"perfect_scores"`
	AvgScore       float64 `json:"avg_score"`
	Q1Accuracy     float64 `json:"q1_accuracy"`
	Q2Accuracy     float64 `json:"q2_accuracy"`
	Q3Accuracy     float64 `json:"q3_accuracy"`
	Q4Accuracy     float64 `json:"q4_accuracy"`
}

type Server struct {
	mu         sync.RWMutex
	webDir     string
	dataDir    string
	sdcardDir  string
	responses  []ResponseRecord
	nextID     int
	startTime  time.Time
}

var correctAnswers = map[string]string{
	"q1": "SGIS (통계지리정보서비스)",
	"q2": "업종통계지도",
	"q3": "일자리맵",
	"q4": "자료제공 서비스",
}

func main() {
	port := flag.Int("port", 8080, "HTTP port to listen on")
	webDir := flag.String("web", "/data/local/tmp/sgis/web", "Path to web static directory")
	dataDir := flag.String("data", "/data/local/tmp/sgis/data", "Internal data storage path")
	sdcardDir := flag.String("sdcard", "/sdcard/SGIS_Responses", "Public sdcard export directory")
	flag.Parse()

	log.Printf("[SGIS-Android] Starting SGIS Booth Mobile Server...")
	log.Printf("[SGIS-Android] Web Dir: %s", *webDir)
	log.Printf("[SGIS-Android] Data Dir: %s", *dataDir)
	log.Printf("[SGIS-Android] SDCard Dir: %s", *sdcardDir)

	_ = os.MkdirAll(*webDir, 0755)
	_ = os.MkdirAll(*dataDir, 0755)
	_ = os.MkdirAll(*sdcardDir, 0755)

	srv := &Server{
		webDir:    *webDir,
		dataDir:   *dataDir,
		sdcardDir: *sdcardDir,
		startTime: time.Now(),
	}

	srv.loadExistingData()

	mux := http.NewServeMux()

	// API Endpoints
	mux.HandleFunc("/api/submit", srv.handleSubmit)
	mux.HandleFunc("/api/responses", srv.handleResponses)
	mux.HandleFunc("/api/stats", srv.handleStats)
	mux.HandleFunc("/api/export/csv", srv.handleExportCSV)
	mux.HandleFunc("/api/export/json", srv.handleExportJSON)
	mux.HandleFunc("/api/health", srv.handleHealth)
	mux.HandleFunc("/health", srv.handleHealth)

	// Admin Redirect
	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin.html", http.StatusFound)
	})
	mux.HandleFunc("/admin/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin.html", http.StatusFound)
	})

	// Static File Handler with Disk Priority
	fileServer := http.FileServer(http.Dir(*webDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		srv.addCORS(w)
		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	log.Printf("[SGIS-Android] Server listening on %s (Tailscale & Local)", addr)

	if err := http.ListenAndServe(addr, srv.corsMiddleware(mux)); err != nil {
		log.Fatalf("[SGIS-Android] Server failed to start: %v", err)
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.addCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) addCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
}

func (s *Server) loadExistingData() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Try loading from primary data path
	primaryPath := filepath.Join(s.dataDir, "quiz_responses.json")
	sdcardPath := filepath.Join(s.sdcardDir, "quiz_responses.json")

	loadFrom := ""
	if _, err := os.Stat(primaryPath); err == nil {
		loadFrom = primaryPath
	} else if _, err := os.Stat(sdcardPath); err == nil {
		loadFrom = sdcardPath
	}

	if loadFrom != "" {
		data, err := os.ReadFile(loadFrom)
		if err == nil {
			var list []ResponseRecord
			if json.Unmarshal(data, &list) == nil {
				s.responses = list
				maxID := 0
				for _, r := range list {
					if r.ID > maxID {
						maxID = r.ID
					}
				}
				s.nextID = maxID + 1
				log.Printf("[SGIS-Android] Restored %d responses from %s", len(list), loadFrom)
				return
			}
		}
	}

	s.responses = []ResponseRecord{}
	s.nextID = 1
	log.Printf("[SGIS-Android] Initialized clean response store")
}

func (s *Server) persistDataLocked() {
	data, err := json.MarshalIndent(s.responses, "", "  ")
	if err == nil {
		_ = os.WriteFile(filepath.Join(s.dataDir, "quiz_responses.json"), data, 0644)
		_ = os.WriteFile(filepath.Join(s.sdcardDir, "quiz_responses.json"), data, 0644)
	}

	// Auto sync Excel UTF-8 BOM CSV to SDCard
	csvData := s.generateCSVBytesLocked()
	_ = os.WriteFile(filepath.Join(s.sdcardDir, "sgis_quiz_responses.csv"), csvData, 0644)
	_ = os.WriteFile(filepath.Join(s.dataDir, "sgis_quiz_responses.csv"), csvData, 0644)
}

func (s *Server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"success":false,"error":"POST only"}`, http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "빈 요청 본문입니다."})
		return
	}

	var payload struct {
		Q1 string `json:"q1"`
		Q2 string `json:"q2"`
		Q3 string `json:"q3"`
		Q4 string `json:"q4"`
		Q5 string `json:"q5"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "올바른 JSON 포맷이 아닙니다."})
		return
	}

	q1 := strings.TrimSpace(payload.Q1)
	q2 := strings.TrimSpace(payload.Q2)
	q3 := strings.TrimSpace(payload.Q3)
	q4 := strings.TrimSpace(payload.Q4)
	q5 := strings.TrimSpace(payload.Q5)

	if q1 == "" || q2 == "" || q3 == "" || q4 == "" || q5 == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "모든 문항을 작성해야 합니다."})
		return
	}

	isQ1 := 0
	if q1 == correctAnswers["q1"] {
		isQ1 = 1
	}
	isQ2 := 0
	if q2 == correctAnswers["q2"] {
		isQ2 = 1
	}
	isQ3 := 0
	if q3 == correctAnswers["q3"] {
		isQ3 = 1
	}
	isQ4 := 0
	if q4 == correctAnswers["q4"] {
		isQ4 = 1
	}

	score := isQ1 + isQ2 + isQ3 + isQ4

	// KST time
	now := time.Now().UTC().Add(9 * time.Hour)
	createdAt := now.Format("2006-01-02 15:04:05")

	clientIP := r.Header.Get("X-Forwarded-For")
	if clientIP == "" {
		clientIP, _, _ = net.SplitHostPort(r.RemoteAddr)
	}

	s.mu.Lock()
	recordID := s.nextID
	s.nextID++

	record := ResponseRecord{
		ID:          recordID,
		CreatedAt:   createdAt,
		Q1Answer:    q1,
		IsQ1Correct: isQ1,
		Q2Answer:    q2,
		IsQ2Correct: isQ2,
		Q3Answer:    q3,
		IsQ3Correct: isQ3,
		Q4Answer:    q4,
		IsQ4Correct: isQ4,
		Q5Feedback:  q5,
		Score:       score,
		UserAgent:   r.UserAgent(),
		IPAddress:   clientIP,
	}

	s.responses = append(s.responses, record)
	s.persistDataLocked()
	s.mu.Unlock()

	log.Printf("[SGIS-Android] Submission #%d recorded! Score: %d/4, IP: %s", recordID, score, clientIP)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"id":         recordID,
		"score":      score,
		"total":      4,
		"created_at": createdAt,
		"message":    "퀴즈 응답이 정상적으로 제출 및 저장되었습니다!",
	})
}

func (s *Server) handleResponses(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := s.computeStatsLocked()

	// Reverse order (newest first)
	n := len(s.responses)
	reversed := make([]ResponseRecord, n)
	for i, item := range s.responses {
		reversed[n-1-i] = item
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"count":     n,
		"stats":     stats,
		"responses": reversed,
	})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := s.computeStatsLocked()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"stats":   stats,
	})
}

func (s *Server) computeStatsLocked() StatsSummary {
	total := len(s.responses)
	if total == 0 {
		return StatsSummary{}
	}

	perfect := 0
	sumScore := 0
	q1C, q2C, q3C, q4C := 0, 0, 0, 0

	for _, r := range s.responses {
		if r.Score == 4 {
			perfect++
		}
		sumScore += r.Score
		if r.IsQ1Correct == 1 {
			q1C++
		}
		if r.IsQ2Correct == 1 {
			q2C++
		}
		if r.IsQ3Correct == 1 {
			q3C++
		}
		if r.IsQ4Correct == 1 {
			q4C++
		}
	}

	return StatsSummary{
		TotalResponses: total,
		PerfectScores:  perfect,
		AvgScore:       float64(int((float64(sumScore)/float64(total))*100)) / 100,
		Q1Accuracy:     float64(int((float64(q1C)/float64(total))*1000)) / 10,
		Q2Accuracy:     float64(int((float64(q2C)/float64(total))*1000)) / 10,
		Q3Accuracy:     float64(int((float64(q3C)/float64(total))*1000)) / 10,
		Q4Accuracy:     float64(int((float64(q4C)/float64(total))*1000)) / 10,
	}
}

func (s *Server) generateCSVBytesLocked() []byte {
	var buf bytes.Buffer
	// UTF-8 BOM \ufeff for Excel
	buf.WriteString("\xEF\xBB\xBF")

	writer := csv.NewWriter(&buf)
	headers := []string{
		"접수번호",
		"제출일시",
		"1번 응답(SGIS명칭)",
		"1번 정답여부",
		"2번 응답(상권지도)",
		"2번 정답여부",
		"3번 응답(일자리맵)",
		"3번 정답여부",
		"4번 응답(자료제공)",
		"4번 정답여부",
		"5번 방문소감 및 바라는 점",
		"총점(4점 만점)",
		"IP주소",
		"브라우저환경",
	}
	_ = writer.Write(headers)

	for _, r := range s.responses {
		corrStr := func(c int) string {
			if c == 1 {
				return "정답"
			}
			return "오답"
		}
		row := []string{
			fmt.Sprintf("%d", r.ID),
			r.CreatedAt,
			r.Q1Answer,
			corrStr(r.IsQ1Correct),
			r.Q2Answer,
			corrStr(r.IsQ2Correct),
			r.Q3Answer,
			corrStr(r.IsQ3Correct),
			r.Q4Answer,
			corrStr(r.IsQ4Correct),
			r.Q5Feedback,
			fmt.Sprintf("%d", r.Score),
			r.IPAddress,
			r.UserAgent,
		}
		_ = writer.Write(row)
	}
	writer.Flush()
	return buf.Bytes()
}

func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	data := s.generateCSVBytesLocked()
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="sgis_quiz_responses.csv"`)
	_, _ = w.Write(data)
}

func (s *Server) handleExportJSON(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	data, err := json.MarshalIndent(s.responses, "", "  ")
	s.mu.RUnlock()

	if err != nil {
		http.Error(w, "JSON export failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="sgis_quiz_responses.json"`)
	_, _ = w.Write(data)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	count := len(s.responses)
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":          "ok",
		"device":          "motorola-edge-70-max",
		"os":              "android-aarch64",
		"total_responses": count,
		"uptime_seconds":  int(time.Since(s.startTime).Seconds()),
	})
}
