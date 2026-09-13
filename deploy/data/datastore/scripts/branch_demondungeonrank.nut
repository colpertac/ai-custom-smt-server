function define(script)
{
    script.Name = "branch_demonDungeonRank";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch on a dungeon's variant type.
function check(source, cState, dState, zone, params)
{
    local instance = zone != null ? zone.GetZoneInstance() : null;
    local variant = instance != null ? instance.GetVariant() : null;
    if(variant != null)
    {
        if(variant.InstanceType != ServerZoneInstanceVariant_InstanceType_t.DEMON_ONLY ||
            variant.TimePointsCount() < 3)
        {
            return -1;
        }

        local timerStart = instance.GetTimerStart();
        local timerStop = instance.GetTimerStop();
        if(timerStart == 0 || timerStop == 0 || timerStop < timerStart)
        {
            return -1;
        }

        local delta = timerStop - timerStart;
        local timeLeft = variant.GetTimePointsByIndex(0) - (delta / 1000000);
        if(timeLeft <= 0)
        {
            return -1;
        }

        if(timeLeft >= variant.GetTimePointsByIndex(1))
        {
            // Rank A
            return 0;
        }
        else if(timeLeft >= variant.GetTimePointsByIndex(2))
        {
            // Rank B
            return 1;
        }
        else
        {
            // Rank C
            return 2;
        }
    }

    return -1;
}