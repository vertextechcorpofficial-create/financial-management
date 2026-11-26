"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface StartReviewCardProps {
  onStart: (payload: { review_name: string; review_date: string }) => Promise<void>;
  isStarting: boolean;
}

export default function StartReviewCard({ onStart, isStarting }: StartReviewCardProps) {
  const [reviewName, setReviewName] = useState("Year-end impairment review FY 2026");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName.trim() || !selectedDate) return;
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    await onStart({ review_name: reviewName, review_date: formattedDate });
  };

  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-4">
      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
        START A REVIEW
      </span>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Input
            placeholder="e.g. Year-end impairment review FY 2026"
            value={reviewName}
            onChange={(e) => setReviewName(e.target.value)}
            className="flex-1 h-9 text-xs bg-background"
            disabled={isStarting}
            required
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 font-medium">Review date</span>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isStarting}
                  className={cn(
                    "w-36 h-9 px-3 justify-between text-left font-normal text-xs bg-background hover:bg-muted/50 border",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <span>
                    {selectedDate ? format(selectedDate, "MM/dd/yyyy") : "Select date"}
                  </span>
                  <CalendarIcon className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50 shadow-md border rounded-md" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            type="submit"
            disabled={isStarting || !reviewName.trim()}
            className="h-9 px-4 text-xs bg-[#1b4332] hover:bg-[#143326] text-white font-medium shadow-2xs shrink-0"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Starting...
              </>
            ) : (
              "Start review"
            )}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Usually done at the financial year-end. December cannot be closed until a review dated in that year is signed off.
        </p>
      </form>
    </div>
  );
}
