function define(script)
{
    script.Name = "transforma_questQuit";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionUpdateQuest command to either reset or complete with no
// rewards depending on if the quest is already completed or not.
function transform(source, cState, dState, zone, params)
{
    local questID = action.GetQuestID();
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress == null)
    {
        return -1;
    }

    local index = (questID / 8).tointeger();
    local shiftVal = (1 << (questID % 8));
    local indexVal = progress.GetCompletedQuestsByIndex(index);

    local resetVal = ((indexVal & shiftVal) == 0) ? -2 : -1;
    action.SetPhase(resetVal);
    action.SetForceUpdate(true);

    return 0;
}