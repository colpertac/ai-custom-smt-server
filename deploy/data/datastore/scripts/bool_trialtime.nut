function define(script)
{
    script.Name = "bool_trialTime";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character's supplied time trial record is as short as
// the supplied time
// - value1: Time trial ID
// - value2: Time to beat
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress == null)
    {
        return -1;
    }
    if(value1 <= 0)
    {
        return -1;
    }
    local time = progress.GetTimeTrialRecordsByIndex(value1 - 1);
    return time != 0 && time <= value2 ? 0 : -1;
}